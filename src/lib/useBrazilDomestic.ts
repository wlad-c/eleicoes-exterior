import { startTransition, useCallback, useEffect, useState } from 'react'
import type { CityResult } from '../types'
import type { CityTableRow } from './cityRows'
import {
  brazilCitiesUrl,
  brazilSuburbsUrl,
  type ElectionRound,
} from './electionRound'
import { mergeBrazilGrain, remapBrazilGrain } from './mergeRounds'

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
let citiesCachedRound: ElectionRound | null = null
let suburbsCachedRound: ElectionRound | null = null
let citiesInflight: Promise<CityResult[] | null> | null = null
let suburbsInflight: Promise<CityResult[] | null> | null = null

const BRAZIL_ID = 'brazil'

function citiesUrl(round: ElectionRound, bust?: string): string {
  const base = brazilCitiesUrl(round)
  return bust ? `${base}?v=${encodeURIComponent(bust)}` : base
}

function suburbsUrl(round: ElectionRound, bust?: string): string {
  const base = brazilSuburbsUrl(round)
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

async function fetchJson<T>(
  url: string,
  opts?: { reload?: boolean },
): Promise<T | null> {
  try {
    const res = await fetch(url, {
      cache: opts?.reload ? 'reload' : 'default',
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

/**
 * Load municipalities in the unified schema:
 * - round 2: runoff file + 1º file → y2026 runoff with yRound1 attached
 * - round 1: 1º file remapped (empty runoff until that grain exists)
 */
async function fetchCities(opts: {
  round: ElectionRound
  bust?: string
  reload?: boolean
}): Promise<CityResult[] | null> {
  if (
    citiesCached &&
    citiesCachedRound === opts.round &&
    !opts.reload
  ) {
    return citiesCached
  }
  if (citiesInflight && !opts.reload) return citiesInflight
  citiesInflight = (async () => {
    try {
      const bust = opts.bust
      const round1Url = citiesUrl('1', bust)
      const round1Doc = await fetchJson<CitiesPayload>(round1Url, opts)
      const round1Rows = round1Doc?.cities ?? []

      let merged: CityResult[]
      if (opts.round === '2') {
        const runoffDoc = await fetchJson<CitiesPayload>(
          citiesUrl('2', bust),
          opts,
        )
        const runoffRows = runoffDoc?.cities ?? []
        if (!runoffRows.length && !round1Rows.length) return null
        merged = mergeBrazilGrain(runoffRows, round1Rows)
      } else {
        if (!round1Rows.length) return null
        merged = remapBrazilGrain(round1Rows)
      }

      citiesCached = stampCountryId(merged, BRAZIL_ID)
      citiesCachedRound = opts.round
      return citiesCached
    } catch {
      return null
    } finally {
      citiesInflight = null
    }
  })()
  return citiesInflight
}

/**
 * Load electoral-zone “neighborhood” grain.
 * Prefer runoff file when present; otherwise fall back to the 1º zonas file
 * remapped into the unified schema (runoff columns stay empty until sync).
 */
async function fetchSuburbs(opts: {
  round: ElectionRound
  bust?: string
  reload?: boolean
}): Promise<CityResult[] | null> {
  if (
    suburbsCached &&
    suburbsCachedRound === opts.round &&
    !opts.reload
  ) {
    return suburbsCached
  }
  if (suburbsInflight && !opts.reload) return suburbsInflight
  suburbsInflight = (async () => {
    try {
      const bust = opts.bust ?? String(Date.now())
      const fetchZonas = async (round: ElectionRound) => {
        const res = await fetch(suburbsUrl(round, bust), {
          cache: opts.reload ? 'reload' : 'no-cache',
          headers: { Accept: 'application/json' },
        })
        if (!res.ok) return null
        const data = (await res.json()) as SuburbsPayload
        return data.suburbs ?? []
      }

      let rows: CityResult[] | null = null
      if (opts.round === '2') {
        rows = await fetchZonas('2')
        if (rows && isValidZonaPayload(rows)) {
          // Attach 1º when available so round-shift columns work.
          const round1 = await fetchZonas('1')
          if (round1 && isValidZonaPayload(round1)) {
            rows = mergeBrazilGrain(rows, round1)
          }
        } else {
          rows = null
        }
      }
      if (!rows) {
        const round1 = await fetchZonas('1')
        if (!round1 || !isValidZonaPayload(round1)) {
          throw new Error(
            `Unexpected suburbs payload (${round1?.length ?? 0} rows) — expected electoral zones`,
          )
        }
        // No runoff zonas file yet — show 1º as yRound1; runoff cells stay empty.
        rows = remapBrazilGrain(round1)
      }

      suburbsCached = stampCountryId(rows, BRAZIL_ID)
      suburbsCachedRound = opts.round
      return suburbsCached
    } catch {
      return null
    } finally {
      suburbsInflight = null
    }
  })()
  return suburbsInflight
}

/** Prefetch municipalities only (~2MB + ~3MB 1º). Do not pull suburbs until needed. */
export function prefetchBrazilCities(round: ElectionRound = '2'): void {
  void fetchCities({ round })
}

/** Event-handler-safe prefetch (ignores the DOM event argument). */
export function prefetchBrazilCitiesHandler(): void {
  prefetchBrazilCities('2')
}

/** Prefetch voting-local suburbs when the Suburb tab is about to be opened. */
export function prefetchBrazilSuburbs(round: ElectionRound = '2'): void {
  void fetchSuburbs({ round, bust: 'prefetch' })
}

/** Event-handler-safe prefetch (ignores the DOM event argument). */
export function prefetchBrazilSuburbsHandler(): void {
  prefetchBrazilSuburbs('2')
}

/**
 * Lazy-load Brazil municipalities (City tab) and voting-local suburbs (Suburb tab).
 * Round 2 loads runoff grains when present and merges 1º turno for comparisons.
 */
export function useBrazilDomestic(opts: {
  wantCities: boolean
  wantSuburbs: boolean
  /** Defaults to runoff — the live app surface. */
  round?: ElectionRound
}): BrazilDomesticState {
  const { wantCities, wantSuburbs, round = '2' } = opts
  const [citiesFetched, setCitiesFetched] = useState<CityResult[] | null>(
    () => (citiesCachedRound === round ? citiesCached : null),
  )
  const [suburbsFetched, setSuburbsFetched] = useState<CityResult[] | null>(
    () => (suburbsCachedRound === round ? suburbsCached : null),
  )
  const [citiesLoading, setCitiesLoading] = useState(false)
  const [suburbsLoading, setSuburbsLoading] = useState(false)
  const [suburbsError, setSuburbsError] = useState<string | null>(null)
  const [suburbRetryTick, setSuburbRetryTick] = useState(0)

  const retrySuburbs = useCallback(() => {
    suburbsCached = null
    suburbsCachedRound = null
    setSuburbsFetched(null)
    setSuburbsError(null)
    setSuburbRetryTick((n) => n + 1)
  }, [])

  useEffect(() => {
    if (!wantCities) return
    if (citiesCached && citiesCachedRound === round) {
      setCitiesFetched(citiesCached)
      return
    }
    let cancelled = false
    setCitiesLoading(true)
    void fetchCities({ round }).then((rows) => {
      if (cancelled) return
      startTransition(() => {
        if (rows) setCitiesFetched(rows)
        setCitiesLoading(false)
      })
    })
    return () => {
      cancelled = true
    }
  }, [wantCities, round])

  useEffect(() => {
    if (!wantSuburbs) return
    if (
      suburbsCached &&
      suburbsCachedRound === round &&
      isValidZonaPayload(suburbsCached)
    ) {
      setSuburbsFetched(suburbsCached)
      setSuburbsError(null)
      return
    }
    if (suburbsCached && !isValidZonaPayload(suburbsCached)) {
      suburbsCached = null
      suburbsCachedRound = null
    }
    let cancelled = false
    setSuburbsLoading(true)
    setSuburbsError(null)
    void fetchSuburbs({
      round,
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
  }, [wantSuburbs, suburbRetryTick, round])

  const cities =
    citiesCachedRound === round ? (citiesCached ?? citiesFetched) : citiesFetched
  const suburbsRaw =
    suburbsCachedRound === round
      ? (suburbsCached ?? suburbsFetched)
      : suburbsFetched
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
