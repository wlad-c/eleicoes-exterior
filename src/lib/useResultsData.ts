import { useEffect, useState } from 'react'
import type { Lang, ResultsData } from '../types'
import { fetchLiveTseZz } from './tseZzLive'

/** Steady-state poll interval after the election-night fast window. */
export const RESULTS_REFRESH_MS = 30 * 60 * 1000

/** Election-night / high-tempo poll interval. */
export const FAST_RESULTS_REFRESH_MS = 5 * 60 * 1000

/**
 * Until this UTC instant, open tabs refresh from TSE every 5 minutes;
 * afterward they fall back to 30 minutes.
 */
export const FAST_REFRESH_UNTIL_MS = Date.parse('2026-10-05T03:50:00.000Z')

/** Ignore focus/visibility refetches that fire more often than this. */
const MIN_FOCUS_REFRESH_MS = 15_000

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
      ? 'atualiza do TSE ao vivo / focar / a cada 5 min'
      : 'live TSE refresh on load / focus / every 5 min'
  }
  return lang === 'pt'
    ? 'busca novos dados ao carregar / focar / a cada 30 min'
    : 'checks for new data on load / focus / every 30 min'
}

function samePayload(a: ResultsData, b: ResultsData): boolean {
  if (a.meta.updatedAt !== b.meta.updatedAt) return false
  if (a.countries.length !== b.countries.length) return false
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Seed from bundled JSON, then refresh from official TSE EA20 ZZ in the
 * browser (no deploy required). Falls back to polling data/results.json
 * if the live TSE fetch fails (e.g. CORS from a non-Pages origin).
 */
export function useResultsData(initial: ResultsData): ResultsData {
  const [data, setData] = useState(initial)

  useEffect(() => {
    let cancelled = false
    let inFlight: Promise<void> | null = null
    let lastPulledAt = 0
    let timer: number | undefined
    // Always start from the latest applied payload so TSE overlays compound.
    let latest = initial

    async function pullDeployedSeed() {
      const url = `${resultsEndpoint()}?t=${Date.now()}`
      const res = await fetch(url, {
        cache: 'no-store',
        headers: { Pragma: 'no-cache', 'Cache-Control': 'no-cache' },
      })
      if (!res.ok) return null
      return (await res.json()) as ResultsData
    }

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
        try {
          // Prefer a fresh seed from Pages, then overlay live TSE.
          const seed = (await pullDeployedSeed()) ?? latest
          let next: ResultsData
          try {
            next = await fetchLiveTseZz(seed)
          } catch {
            next = seed
          }
          if (cancelled) return
          lastPulledAt = Date.now()
          latest = next
          setData((prev) => (samePayload(prev, next) ? prev : next))
        } catch {
          /* keep last good payload */
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

    void pull(true)
    scheduleNext()

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

  return data
}
