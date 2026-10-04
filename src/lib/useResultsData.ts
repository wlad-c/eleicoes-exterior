import { useEffect, useState } from 'react'
import type { ResultsData } from '../types'

/** How often the live page re-fetches `data/results.json` after deploy. */
export const RESULTS_REFRESH_MS = 30 * 60 * 1000

/** Ignore focus/visibility refetches that fire more often than this. */
const MIN_FOCUS_REFRESH_MS = 15_000

function resultsEndpoint(): string {
  return `${import.meta.env.BASE_URL}data/results.json`
}

/** Default 30 minutes; override with `?refreshMs=<ms>` for local checks. */
export function resolveRefreshMs(
  search = typeof window !== 'undefined' ? window.location.search : '',
): number {
  const raw = new URLSearchParams(search).get('refreshMs')
  if (raw && /^\d+$/.test(raw)) return Math.max(1_000, Number(raw))
  return RESULTS_REFRESH_MS
}

function samePayload(a: ResultsData, b: ResultsData): boolean {
  if (a.meta.updatedAt !== b.meta.updatedAt) return false
  if (a.countries.length !== b.countries.length) return false
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Seed from the bundled JSON for first paint, then poll the stable public
 * copy so open tabs pick up redeployed tallies without a full reload.
 */
export function useResultsData(initial: ResultsData): ResultsData {
  const [data, setData] = useState(initial)

  useEffect(() => {
    let cancelled = false
    let inFlight: Promise<void> | null = null
    let lastPulledAt = 0
    const refreshMs = resolveRefreshMs()

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
          const url = `${resultsEndpoint()}?t=${Date.now()}`
          const res = await fetch(url, {
            cache: 'no-store',
            headers: { Pragma: 'no-cache', 'Cache-Control': 'no-cache' },
          })
          if (!res.ok || cancelled) return
          const next = (await res.json()) as ResultsData
          if (cancelled) return
          lastPulledAt = Date.now()
          setData((prev) => (samePayload(prev, next) ? prev : next))
        } catch {
          /* keep last good payload */
        } finally {
          inFlight = null
        }
      })()

      return inFlight
    }

    // Critical: fetch once on mount. Previously we only waited for the
    // interval, so open tabs could sit on stale seed data for a full 30 min.
    void pull(true)

    const id = window.setInterval(() => {
      void pull(true)
    }, refreshMs)

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
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  return data
}
