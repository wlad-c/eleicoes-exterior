import { startTransition, useEffect, useState } from 'react'
import type { CityResult } from '../types'

type CitiesPayload = {
  countryId: string
  count: number
  cities: CityResult[]
}

type SuburbsPayload = {
  countryId: string
  count: number
  suburbs: CityResult[]
}

export type BrazilDomesticState = {
  cities: CityResult[] | null
  suburbs: CityResult[] | null
  citiesLoading: boolean
  suburbsLoading: boolean
}

let citiesCached: CityResult[] | null = null
let suburbsCached: CityResult[] | null = null
let citiesInflight: Promise<CityResult[] | null> | null = null
let suburbsInflight: Promise<CityResult[] | null> | null = null

function citiesUrl(): string {
  return `${import.meta.env.BASE_URL}data/brazil-cities.json`
}

function suburbsUrl(): string {
  return `${import.meta.env.BASE_URL}data/brazil-suburbs.json`
}

async function fetchCities(): Promise<CityResult[] | null> {
  if (citiesCached) return citiesCached
  if (citiesInflight) return citiesInflight
  citiesInflight = (async () => {
    try {
      const res = await fetch(citiesUrl(), {
        cache: 'force-cache',
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as CitiesPayload
      citiesCached = data.cities ?? []
      return citiesCached
    } catch {
      return null
    } finally {
      citiesInflight = null
    }
  })()
  return citiesInflight
}

async function fetchSuburbs(): Promise<CityResult[] | null> {
  if (suburbsCached) return suburbsCached
  if (suburbsInflight) return suburbsInflight
  suburbsInflight = (async () => {
    try {
      const res = await fetch(suburbsUrl(), {
        cache: 'force-cache',
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as SuburbsPayload
      suburbsCached = data.suburbs ?? []
      return suburbsCached
    } catch {
      return null
    } finally {
      suburbsInflight = null
    }
  })()
  return suburbsInflight
}

/** Prefetch municipalities (and kick suburb download) on Include Brazil hover. */
export function prefetchBrazilDomestic(): void {
  void fetchCities()
  void fetchSuburbs()
}

/**
 * Lazy-load Brazil municipalities (City tab) and voting-local suburbs (Suburb tab).
 */
export function useBrazilDomestic(opts: {
  wantCities: boolean
  wantSuburbs: boolean
}): BrazilDomesticState {
  const { wantCities, wantSuburbs } = opts
  const [citiesFetched, setCitiesFetched] = useState<CityResult[] | null>(null)
  const [suburbsFetched, setSuburbsFetched] = useState<CityResult[] | null>(
    null,
  )
  const [citiesLoading, setCitiesLoading] = useState(false)
  const [suburbsLoading, setSuburbsLoading] = useState(false)

  useEffect(() => {
    if (!wantCities || citiesCached) return
    let cancelled = false
    setCitiesLoading(true)
    void fetchCities().then((rows) => {
      if (cancelled) return
      startTransition(() => {
        if (rows) setCitiesFetched(rows)
        setCitiesLoading(false)
      })
    })
    return () => {
      cancelled = true
    }
  }, [wantCities])

  useEffect(() => {
    if (!wantSuburbs || suburbsCached) return
    let cancelled = false
    setSuburbsLoading(true)
    void fetchSuburbs().then((rows) => {
      if (cancelled) return
      startTransition(() => {
        if (rows) setSuburbsFetched(rows)
        setSuburbsLoading(false)
      })
    })
    return () => {
      cancelled = true
    }
  }, [wantSuburbs])

  const cities = citiesCached ?? citiesFetched
  const suburbs = suburbsCached ?? suburbsFetched
  return {
    cities,
    suburbs,
    citiesLoading: Boolean(wantCities && !cities && citiesLoading),
    suburbsLoading: Boolean(wantSuburbs && !suburbs && suburbsLoading),
  }
}
