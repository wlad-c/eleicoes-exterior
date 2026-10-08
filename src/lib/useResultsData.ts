import { useEffect, useState } from 'react'
import type { Lang, ResultsData } from '../types'
import { fetchLiveTseZz } from './tseZzLive'

/** Steady-state poll interval after the election-night fast window. */
export const RESULTS_REFRESH_MS = 30 * 60 * 1000

/** Election-night poll interval — short so the UI visibly keeps up. */
export const FAST_RESULTS_REFRESH_MS = 2 * 60 * 1000

/**
 * Until this UTC instant, open tabs refresh from TSE on the fast interval;
 * afterward they fall back to 30 minutes.
 */
export const FAST_REFRESH_UNTIL_MS = Date.parse('2026-10-05T03:50:00.000Z')

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

export function isFastRefreshWindow(now = Date.now()): boolean {
  return now < FAST_REFRESH_UNTIL_MS
}

export function defaultRefreshMs(now = Date.now()): number {
  return isFastRefreshWindow(now) ? FAST_RESULTS_REFRESH_MS : RESULTS_REFRESH_MS
}

/** Default follows the fast/slow window; override with `?refreshMs=<ms>`. */
export function resolveRefreshMs(
  search = typeof window !== 'undefined' ? window.location.search : '',
  now = Date.now(),
): number {
  const raw = new URLSearchParams(search).get('refreshMs')
  if (raw && /^\d+$/.test(raw)) return Math.max(1_000, Number(raw))
  return defaultRefreshMs(now)
}

export function autoRefreshLabel(lang: Lang, now = Date.now()): string {
  if (isFastRefreshWindow(now)) {
    return lang === 'pt'
      ? 'TSE ao vivo a cada 2 min'
      : 'live TSE every 2 min'
  }
  return lang === 'pt'
    ? 'atualiza a cada 30 min'
    : 'updates every 30 min'
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
 * EA20 ZZ in the browser. After the first successful live pull, do NOT
 * re-apply a stale Pages seed (that was wiping live tallies).
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
      timer = window.setTimeout(() => {
        void pull(true).finally(scheduleNext)
      }, refreshMs)
    }

    // Chain: finish first pull, then start the interval (avoids overlap).
    void pull(true).finally(scheduleNext)

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
