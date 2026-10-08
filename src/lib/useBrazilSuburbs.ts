import { startTransition, useEffect, useState } from 'react'
import type { CityResult } from '../types'

type SuburbPayload = {
  countryId: string
  count: number
  suburbs: CityResult[]
}

export type BrazilSuburbsState = {
  suburbs: CityResult[] | null
  loading: boolean
  error: boolean
}

let cached: CityResult[] | null = null
let inflight: Promise<CityResult[] | null> | null = null

function suburbsUrl(): string {
  return `${import.meta.env.BASE_URL}data/brazil-suburbs.json`
}

async function fetchSuburbs(): Promise<CityResult[] | null> {
  if (cached) return cached
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const res = await fetch(suburbsUrl(), {
        cache: 'force-cache',
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as SuburbPayload
      cached = data.suburbs ?? []
      return cached
    } catch {
      return null
    } finally {
      inflight = null
    }
  })()
  return inflight
}

/** Prefetch without forcing a React update (e.g. on Include Brazil hover). */
export function prefetchBrazilSuburbs(): void {
  void fetchSuburbs()
}

/**
 * Lazy-load Brazil municipality rows only when the tables need them.
 * Module-level cache keeps a second Include Brazil toggle instant.
 */
export function useBrazilSuburbs(enabled: boolean): BrazilSuburbsState {
  const [fetched, setFetched] = useState<CityResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!enabled || cached) return
    let cancelled = false
    setLoading(true)
    setError(false)
    void fetchSuburbs().then((rows) => {
      if (cancelled) return
      startTransition(() => {
        if (rows) {
          setFetched(rows)
          setError(false)
        } else {
          setError(true)
        }
        setLoading(false)
      })
    })
    return () => {
      cancelled = true
    }
  }, [enabled])

  const suburbs = cached ?? fetched
  return {
    suburbs,
    loading: Boolean(enabled && !suburbs && loading),
    error: Boolean(enabled && !suburbs && error),
  }
}
