import { startTransition, useCallback, useEffect, useState } from 'react'
import type { CityResult } from '../types'
import type { CityTableRow } from './cityRows'

type CitiesPayload = {
  countryId: string
  count: number
  updatedAt?: string
  cities: CityResult[]
}

type SuburbsPayload = {
  countryId: string
  count: number
  updatedAt?: string
  suburbs: CityResult[]
}

export type BrazilDomesticState = {
  cities: CityResult[] | null
  suburbs: CityResult[] | null
  citiesLoading: boolean
  suburbsLoading: boolean
  suburbsError: string | null
  retrySuburbs: () => void
}

let citiesCached: CityResult[] | null = null
let suburbsCached: CityResult[] | null = null
let citiesInflight: Promise<CityResult[] | null> | null = null
let suburbsInflight: Promise<CityResult[] | null> | null = null

const BRAZIL_ID = 'brazil'

function citiesUrl(bust?: string): string {
  const base = `${import.meta.env.BASE_URL}data/brazil-cities.json`
  return bust ? `${base}?v=${encodeURIComponent(bust)}` : base
}

function suburbsUrl(bust?: string): string {
  const base = `${import.meta.env.BASE_URL}data/brazil-suburbs.json`
  return bust ? `${base}?v=${encodeURIComponent(bust)}` : base
}

/** Stamp countryId once so table tagging can reuse the array without remapping. */
function stampCountryId(rows: CityResult[], countryId: string): CityResult[] {
  for (const row of rows) {
    const tagged = row as CityTableRow
    if (tagged.countryId !== countryId) tagged.countryId = countryId
  }
  return rows
}

/**
 * Reject mistaken/stale caches that served municipalities (or voting-place
 * lists) instead of electoral-zone rows (codes like SP-71072-Z001).
 */
function looksLikeMunicipalityFile(rows: CityResult[]): boolean {
  if (!rows.length) return true
  const sample = rows.slice(0, 30)
  let cityLike = 0
  for (const r of sample) {
    const parts = (r.code || '').split('-')
    if (r.level === 'city' || parts.length <= 2) cityLike += 1
  }
  return cityLike >= Math.ceil(sample.length * 0.5)
}

function isValidZonaPayload(rows: CityResult[]): boolean {
  if (rows.length < 1000) return false
  if (looksLikeMunicipalityFile(rows)) return false
  const sample = rows[0]
  const parts = (sample.code || '').split('-')
  return (
    parts.length >= 3 &&
    (/^Z\d+/i.test(parts[parts.length - 1] || '') ||
      /zona|zone/i.test(sample.name || ''))
  )
}

async function fetchCities(opts?: {
  bust?: string
  reload?: boolean
}): Promise<CityResult[] | null> {
  if (citiesCached && !opts?.reload) return citiesCached
  if (citiesInflight && !opts?.reload) return citiesInflight
  citiesInflight = (async () => {
    try {
      const res = await fetch(citiesUrl(opts?.bust), {
        cache: opts?.reload ? 'reload' : 'default',
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as CitiesPayload
      const rows = data.cities ?? []
      citiesCached = stampCountryId(rows, BRAZIL_ID)
      return citiesCached
    } catch {
      return null
    } finally {
      citiesInflight = null
    }
  })()
  return citiesInflight
}

async function fetchSuburbs(opts?: {
  bust?: string
  reload?: boolean
}): Promise<CityResult[] | null> {
  if (suburbsCached && !opts?.reload) return suburbsCached
  if (suburbsInflight && !opts?.reload) return suburbsInflight
  suburbsInflight = (async () => {
    try {
      const res = await fetch(suburbsUrl(opts?.bust ?? String(Date.now())), {
        // Never force-cache: a stale/wrong body (e.g. municipality file) was
        // sticky on mobile and made Local look identical to City (~5.5k rows).
        cache: opts?.reload ? 'reload' : 'no-cache',
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as SuburbsPayload
      const rows = data.suburbs ?? []
      if (!isValidZonaPayload(rows)) {
        throw new Error(
          `Unexpected suburbs payload (${rows.length} rows) — expected electoral zones`,
        )
      }
      suburbsCached = stampCountryId(rows, BRAZIL_ID)
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
  void fetchSuburbs({ bust: 'prefetch' })
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
  const [suburbsError, setSuburbsError] = useState<string | null>(null)
  const [suburbRetryTick, setSuburbRetryTick] = useState(0)

  const retrySuburbs = useCallback(() => {
    suburbsCached = null
    setSuburbsFetched(null)
    setSuburbsError(null)
    setSuburbRetryTick((n) => n + 1)
  }, [])

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
    if (suburbsCached && isValidZonaPayload(suburbsCached)) {
      setSuburbsFetched(suburbsCached)
      setSuburbsError(null)
      return
    }
    if (suburbsCached && !isValidZonaPayload(suburbsCached)) {
      suburbsCached = null
    }
    let cancelled = false
    setSuburbsLoading(true)
    setSuburbsError(null)
    void fetchSuburbs({
      bust: `r${suburbRetryTick}`,
      reload: suburbRetryTick > 0,
    }).then((rows) => {
      if (cancelled) return
      startTransition(() => {
        if (rows) {
          setSuburbsFetched(rows)
          setSuburbsError(null)
        } else {
          setSuburbsFetched(null)
          setSuburbsError('load-failed')
        }
        setSuburbsLoading(false)
      })
    })
    return () => {
      cancelled = true
    }
  }, [wantSuburbs, suburbRetryTick])

  const cities = citiesCached ?? citiesFetched
  const suburbsRaw = suburbsCached ?? suburbsFetched
  const suburbs =
    suburbsRaw && isValidZonaPayload(suburbsRaw) ? suburbsRaw : null

  return {
    cities,
    suburbs,
    citiesLoading: Boolean(wantCities && !cities && citiesLoading),
    suburbsLoading: Boolean(wantSuburbs && !suburbs && suburbsLoading),
    suburbsError: wantSuburbs && !suburbs && !suburbsLoading ? suburbsError : null,
    retrySuburbs,
  }
}
