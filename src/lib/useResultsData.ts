import { useEffect, useState } from 'react'
import type { Lang, ResultsData } from '../types'
import {
  type ElectionRound,
  RUNOFF_REFRESH_START_MS,
  isRefreshPaused,
  resolveRefreshMs,
  resultsSeedUrl,
} from './electionRound'
import { t } from './i18n'
import { fetchLiveTseZz } from './tseZzLive'

export {
  RUNOFF_REFRESH_START_MS as REFRESH_START_MS,
  RESULTS_REFRESH_FAST_MS,
  RESULTS_REFRESH_MS,
  isRefreshPaused,
  resolveRefreshMs,
} from './electionRound'

/** Ignore focus/visibility refetches that fire more often than this. */
const MIN_FOCUS_REFRESH_MS = 20_000

export type SyncStatus = 'idle' | 'syncing' | 'ok' | 'error'

export type ResultsDataState = {
  data: ResultsData
  syncStatus: SyncStatus
  live: boolean
}

async function pullDeployedSeed(round: ElectionRound): Promise<ResultsData | null> {
  try {
    const url = `${resultsSeedUrl(round)}?t=${Date.now()}`
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { Pragma: 'no-cache', 'Cache-Control': 'no-cache' },
    })
    if (!res.ok) return null
    return (await res.json()) as ResultsData
  } catch {
    return null
  }
}

/**
 * Cheap equality for live TSE overlays. Avoids JSON.stringify on the full
 * country tree (Brazil municipalities alone are thousands of rows).
 */
function samePayload(a: ResultsData, b: ResultsData): boolean {
  if (a.meta.updatedAt !== b.meta.updatedAt) return false
  if (a.meta.tseZz?.sectionsCounted !== b.meta.tseZz?.sectionsCounted) {
    return false
  }
  if (a.meta.tseZz?.election !== b.meta.tseZz?.election) return false
  if (a.meta.tseBr?.sectionsCounted !== b.meta.tseBr?.sectionsCounted) {
    return false
  }
  if (a.countries.length !== b.countries.length) return false
  for (let i = 0; i < a.countries.length; i++) {
    const ca = a.countries[i]
    const cb = b.countries[i]
    if (ca.id !== cb.id || ca.status !== cb.status) return false
    if (ca.source !== cb.source) return false
    if (ca.y2026?.totalValid !== cb.y2026?.totalValid) return false
    if (ca.y2026?.lula !== cb.y2026?.lula) return false
    if (ca.y2026?.bolsonaro !== cb.y2026?.bolsonaro) return false
    if (ca.coverage?.counted !== cb.coverage?.counted) return false
    if (ca.coverage?.total !== cb.coverage?.total) return false
    if ((ca.areas?.length ?? 0) !== (cb.areas?.length ?? 0)) return false
    if ((ca.cities?.length ?? 0) !== (cb.cities?.length ?? 0)) return false
  }
  return true
}

export function autoRefreshLabel(lang: Lang, now = Date.now()): string {
  if (isRefreshPaused(now)) return t('autoRefreshPaused', lang)
  const ms = resolveRefreshMs(undefined, now)
  if (ms != null && ms <= 5 * 60 * 1000) return t('autoRefreshFast', lang)
  return t('autoRefresh', lang)
}

/**
 * Seed from bundled/Pages JSON once, then keep refreshing from official TSE
 * EA20 ZZ in the browser once NZ booths close for the runoff. Live polling
 * only runs while the active tab is the runoff round (2º); 1º stays frozen.
 */
export function useResultsData(
  initial: ResultsData,
  round: ElectionRound,
): ResultsDataState {
  const [data, setData] = useState(initial)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [live, setLive] = useState(false)

  // Reset when the user switches rounds so we never show R1 data under R2 chrome.
  useEffect(() => {
    setData(initial)
    setSyncStatus('idle')
    setLive(false)
  }, [initial, round])

  useEffect(() => {
    let cancelled = false
    let inFlight: Promise<void> | null = null
    let lastPulledAt = 0
    let timer: number | undefined
    let latest = initial
    let hasLive = false

    async function pull(force = false) {
      if (cancelled) return
      // 1º turno is frozen — never hit live TSE for that tab.
      if (round !== '2') return
      // While paused (no ?refreshMs override), do not hit live TSE.
      if (resolveRefreshMs() == null) return
      if (
        !force &&
        lastPulledAt > 0 &&
        Date.now() - lastPulledAt < MIN_FOCUS_REFRESH_MS
      ) {
        return
      }
      if (inFlight) return inFlight

      inFlight = (async () => {
        setSyncStatus('syncing')
        try {
          let base = latest
          if (!hasLive) {
            base = (await pullDeployedSeed(round)) ?? latest
          }

          const next = await fetchLiveTseZz(base, { round: '2' })
          if (cancelled) return
          hasLive = true
          setLive(true)
          lastPulledAt = Date.now()
          latest = next
          setData((prev) => (samePayload(prev, next) ? prev : next))
          setSyncStatus('ok')
        } catch {
          if (cancelled) return
          if (!hasLive) {
            const seed = await pullDeployedSeed(round)
            if (seed && !cancelled) {
              latest = seed
              setData(seed)
            }
          }
          setSyncStatus('error')
        } finally {
          inFlight = null
        }
      })()

      return inFlight
    }

    function scheduleNext() {
      if (cancelled) return
      if (round !== '2') return
      const refreshMs = resolveRefreshMs()
      const delay =
        refreshMs != null
          ? refreshMs
          : Math.max(1_000, RUNOFF_REFRESH_START_MS - Date.now())
      timer = window.setTimeout(() => {
        void pull(true).finally(scheduleNext)
      }, delay)
    }

    async function boot() {
      if (round !== '2') {
        setSyncStatus('idle')
        return
      }
      if (resolveRefreshMs() == null) {
        const seed = await pullDeployedSeed(round)
        if (!cancelled && seed) {
          latest = seed
          setData((prev) => (samePayload(prev, seed) ? prev : seed))
          setSyncStatus('idle')
        }
        scheduleNext()
        return
      }
      void pull(true).finally(scheduleNext)
    }

    void boot()

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      void pull(false)
    }
    const onFocus = () => {
      void pull(false)
    }

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)

    return () => {
      cancelled = true
      if (timer !== undefined) window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
    }
  }, [initial, round])

  return { data, syncStatus, live }
}
