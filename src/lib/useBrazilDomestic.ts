import { startTransition, useEffect, useState } from 'react'
import type { CityResult } from '../types'
import type { CityTableRow } from './cityRows'

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

const BRAZIL_ID = 'brazil'

function citiesUrl(): string {
  return `${import.meta.env.BASE_URL}data/brazil-cities.json`
}

function suburbsUrl(): string {
  return `${import.meta.env.BASE_URL}data/brazil-suburbs.json`
}

/** Stamp countryId once so table tagging can reuse the array without remapping ~90k rows. */
function stampCountryId(rows: CityResult[], countryId: string): CityResult[] {
  for (const row of rows) {
    const tagged = row as CityTableRow
    if (tagged.countryId !== countryId) tagged.countryId = countryId
  }
  return rows
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
      citiesCached = stampCountryId(data.cities ?? [], BRAZIL_ID)
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
      suburbsCached = stampCountryId(data.suburbs ?? [], BRAZIL_ID)
      return suburbsCached
    } catch {
      return null
    } finally {
      suburbsInflight = null
    }
  })()
  return suburbsInflight
}

/** Prefetch municipalities only (~2MB). Do not pull suburbs (~41MB) until that tab needs them. */
export function prefetchBrazilCities(): void {
  void fetchCities()
}

/** Prefetch voting-local suburbs when the Suburb tab is about to be opened. */
export function prefetchBrazilSuburbs(): void {
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
  const [citiesFetched, setCitiesFetched] = useState<CityResult[] | null>(
    () => citiesCached,
  )
  const [suburbsFetched, setSuburbsFetched] = useState<CityResult[] | null>(
    () => suburbsCached,
  )
  const [citiesLoading, setCitiesLoading] = useState(false)
  const [suburbsLoading, setSuburbsLoading] = useState(false)

  useEffect(() => {
    if (!wantCities) return
    if (citiesCached) {
      setCitiesFetched(citiesCached)
      return
    }
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
    if (!wantSuburbs) return
    if (suburbsCached) {
      setSuburbsFetched(suburbsCached)
      return
    }
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
