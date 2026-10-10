import { useEffect, useState } from 'react'
import type { Lang, ResultsData } from '../types'
import { t } from './i18n'
import { fetchLiveTseZz } from './tseZzLive'

/** Poll interval once live refresh is allowed (runoff counting). */
export const RESULTS_REFRESH_MS = 30 * 60 * 1000

/**
 * First overseas booths close in New Zealand (17:00 NZDT on runoff Sunday).
 * Until then, skip live TSE polling; afterward check every 30 minutes.
 */
export const REFRESH_START_MS = Date.parse('2026-10-25T04:00:00.000Z')

/** Ignore focus/visibility refetches that fire more often than this. */
const MIN_FOCUS_REFRESH_MS = 20_000

export type SyncStatus = 'idle' | 'syncing' | 'ok' | 'error'

export type ResultsDataState = {
  data: ResultsData
  syncStatus: SyncStatus
  live: boolean
}

function resultsEndpoint(): string {
  return `${import.meta.env.BASE_URL}data/results.json`
}

export function isRefreshPaused(now = Date.now()): boolean {
  return now < REFRESH_START_MS
}

/** Override with `?refreshMs=<ms>`; otherwise null while paused, else 30 min. */
export function resolveRefreshMs(
  search = typeof window !== 'undefined' ? window.location.search : '',
  now = Date.now(),
): number | null {
  const raw = new URLSearchParams(search).get('refreshMs')
  if (raw && /^\d+$/.test(raw)) return Math.max(1_000, Number(raw))
  if (isRefreshPaused(now)) return null
  return RESULTS_REFRESH_MS
}

export function autoRefreshLabel(lang: Lang, now = Date.now()): string {
  if (isRefreshPaused(now)) return t('autoRefreshPaused', lang)
  return t('autoRefresh', lang)
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
  if (a.meta.tseBr?.sectionsCounted !== b.meta.tseBr?.sectionsCounted) {
    return false
  }
  if (a.countries.length !== b.countries.length) return false
  for (let i = 0; i < a.countries.length; i++) {
    const ca = a.countries[i]
    const cb = b.countries[i]
    if (ca.id !== cb.id || ca.status !== cb.status) return false
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

async function pullDeployedSeed(): Promise<ResultsData | null> {
  try {
    const url = `${resultsEndpoint()}?t=${Date.now()}`
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
 * Seed from bundled/Pages JSON once, then keep refreshing from official TSE
 * EA20 ZZ in the browser once NZ booths close for the runoff. After the first
 * successful live pull, do NOT re-apply a stale Pages seed.
 */
export function useResultsData(initial: ResultsData): ResultsDataState {
  const [data, setData] = useState(initial)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [live, setLive] = useState(false)

  useEffect(() => {
    let cancelled = false
    let inFlight: Promise<void> | null = null
    let lastPulledAt = 0
    let timer: number | undefined
    let latest = initial
    let hasLive = false

    async function pull(force = false) {
      if (cancelled) return
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
          // Only pull Pages seed before the first successful live TSE overlay.
          // Re-seeding afterward can regress countries to an older deploy.
          let base = latest
          if (!hasLive) {
            base = (await pullDeployedSeed()) ?? latest
          }

          const next = await fetchLiveTseZz(base)
          if (cancelled) return
          hasLive = true
          setLive(true)
          lastPulledAt = Date.now()
          latest = next
          setData((prev) => (samePayload(prev, next) ? prev : next))
          setSyncStatus('ok')
        } catch {
          if (cancelled) return
          // First failure: try seed alone so the page isn't empty.
          if (!hasLive) {
            const seed = await pullDeployedSeed()
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
      const refreshMs = resolveRefreshMs()
      const delay =
        refreshMs != null
          ? refreshMs
          : Math.max(1_000, REFRESH_START_MS - Date.now())
      timer = window.setTimeout(() => {
        void pull(true).finally(scheduleNext)
      }, delay)
    }

    async function boot() {
      // While paused, only refresh the deployed seed once — no live TSE.
      if (resolveRefreshMs() == null) {
        const seed = await pullDeployedSeed()
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
  }, [initial])

  return { data, syncStatus, live }
}
