import { useEffect, useState } from 'react'
import type { ResultsData } from '../types'

/** How often the live page re-fetches `data/results.json` after deploy. */
export const RESULTS_REFRESH_MS = 30 * 60 * 1000

function resultsEndpoint(): string {
  return `${import.meta.env.BASE_URL}data/results.json`
}

/**
 * Seed from the bundled JSON for first paint, then poll the stable public
 * copy so open tabs pick up redeployed tallies without a full reload.
 */
export function useResultsData(initial: ResultsData): ResultsData {
  const [data, setData] = useState(initial)

  useEffect(() => {
    let cancelled = false
    let lastPulledAt = Date.now()

    async function pull() {
      try {
        const res = await fetch(`${resultsEndpoint()}?t=${Date.now()}`, {
          cache: 'no-store',
        })
        if (!res.ok || cancelled) return
        const next = (await res.json()) as ResultsData
        if (cancelled) return
        lastPulledAt = Date.now()
        setData((prev) =>
          JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
        )
      } catch {
        /* keep last good payload */
      }
    }

    const id = window.setInterval(() => {
      void pull()
    }, RESULTS_REFRESH_MS)

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastPulledAt < RESULTS_REFRESH_MS) return
      void pull()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return data
}
