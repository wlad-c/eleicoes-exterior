import locationMap from '../data/tse-location-map.json'
import location2022 from '../data/tse-location-2022.json'
import type { CityResult, Coverage, YearResult } from '../types'
import { withPlaceNames } from './placeNames'
import { tseBaseUrl } from './tseZzLive'

type Loc2022Map = Record<
  string,
  Record<
    string,
    {
      lula: number
      bolsonaro: number
      totalValid: number
      lulaPct: number
      bolsonaroPct: number
    }
  >
>

const PLEITO = '3220'

type MunLocConfig = {
  name: string
  cities: Record<string, string[] | '*'>
}

type CountryLocConfig = {
  source?: { en: string; pt: string }
  areas: Record<string, MunLocConfig>
}

type LocMap = Record<string, CountryLocConfig>

function pad(n: string | number, w: number): string {
  return String(n).padStart(w, '0')
}

function round1(n: number): number {
  return Math.round(n * 100) / 100
}

function yearResult(lula: number, bolsonaro: number, totalValid: number): YearResult {
  return {
    lula,
    bolsonaro,
    totalValid,
    lulaPct: totalValid ? round1((lula / totalValid) * 100) : 0,
    bolsonaroPct: totalValid ? round1((bolsonaro / totalValid) * 100) : 0,
  }
}

function swingOf(y2022: YearResult | null, y2026: YearResult) {
  if (!y2022) return null
  const lulaPp = round1(y2026.lulaPct - y2022.lulaPct)
  const bolsonaroPp = round1(y2026.bolsonaroPct - y2022.bolsonaroPct)
  return {
    lulaPp,
    bolsonaroPp,
    marginPp: round1(lulaPp - bolsonaroPp),
  }
}

function fold(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
}

const LOC_ALIASES: Record<string, string> = {
  NAGOIA: 'NAGOYA',
  NAGOYA: 'NAGOIA',
  OIZUMI: 'GUNMA',
  GUNMA: 'OIZUMI',
}

function matchLocKey(
  byLoc: Loc2022Map[string] | undefined,
  locName: string,
  claimed: Set<string>,
): string | null {
  if (!byLoc) return null
  if (byLoc[locName] && !claimed.has(fold(locName))) return locName
  const f = fold(locName)
  for (const k of Object.keys(byLoc)) {
    if (fold(k) === f && !claimed.has(fold(k))) return k
  }
  const alias = LOC_ALIASES[f]
  if (alias) {
    for (const k of Object.keys(byLoc)) {
      if (
        (fold(k) === alias || fold(k) === fold(alias)) &&
        !claimed.has(fold(k))
      ) {
        return k
      }
    }
  }
  return null
}

function attachLoc2022(
  rows: Array<{
    areaCode: string
    name: string
    y2026: YearResult
    y2022: YearResult | null
    swing: ReturnType<typeof swingOf>
  }>,
) {
  const claimed = new Map<string, Set<string>>()
  for (const row of rows) {
    const mun = row.areaCode
    if (!claimed.has(mun)) claimed.set(mun, new Set())
    const byLoc = (location2022 as Loc2022Map)[mun]
    const key = matchLocKey(byLoc, row.name, claimed.get(mun)!)
    if (!key || !byLoc) {
      row.y2022 = null
      row.swing = null
      continue
    }
    claimed.get(mun)!.add(fold(key))
    const raw = byLoc[key]
    row.y2022 = yearResult(raw.lula, raw.bolsonaro, raw.totalValid)
    row.swing = swingOf(row.y2022, row.y2026)
  }
  for (const row of rows) {
    if (row.y2022) continue
    const mun = row.areaCode
    if (!claimed.has(mun)) claimed.set(mun, new Set())
    const byLoc = (location2022 as Loc2022Map)[mun] || {}
    const free = Object.keys(byLoc).filter((k) => !claimed.get(mun)!.has(fold(k)))
    const unmatched = rows.filter((r) => r.areaCode === mun && !r.y2022)
    if (free.length === 1 && unmatched.length === 1) {
      const key = free[0]
      claimed.get(mun)!.add(fold(key))
      const raw = byLoc[key]
      row.y2022 = yearResult(raw.lula, raw.bolsonaro, raw.totalValid)
      row.swing = swingOf(row.y2022, row.y2026)
    }
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return res.json() as Promise<T>
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return new Uint8Array(await res.arrayBuffer())
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  async function run() {
    while (i < items.length) {
      const idx = i++
      out[idx] = await worker(items[idx])
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length || 1) }, () => run()),
  )
  return out
}

/** Extract candidate number → vote count from a TSE .bu ASN.1 payload. */
export function parseBuCandidateVotes(bu: Uint8Array): Record<string, number> {
  const votes: Record<string, number> = {}
  let i = 0
  while (i < bu.length - 10) {
    // CONTEXT [3] IMPLICIT SEQUENCE with two identical INTEGER candidate numbers
    if (bu[i] === 0xa3 && bu[i + 1] === 0x06 && bu[i + 2] === 0x02) {
      const nlen = bu[i + 3]
      let candidate = 0
      for (let k = 0; k < nlen; k++) candidate = (candidate << 8) | bu[i + 4 + k]

      let qtd: number | null = null
      for (let j = i - 1; j >= Math.max(0, i - 12); j--) {
        if (bu[j] === 0x82 && j + 1 < i) {
          const qlen = bu[j + 1]
          if (qlen > 0 && qlen <= 4 && j + 2 + qlen <= i) {
            qtd = 0
            for (let k = 0; k < qlen; k++) qtd = (qtd << 8) | bu[j + 2 + k]
            break
          }
        }
      }
      if (qtd != null) {
        const key = String(candidate)
        votes[key] = (votes[key] || 0) + qtd
      }
      i += 8
      continue
    }
    i++
  }
  return votes
}

function resolveLocation(
  section: string,
  munCfg: MunLocConfig,
): string | null {
  for (const [loc, secs] of Object.entries(munCfg.cities)) {
    if (secs === '*') continue
    if (secs.includes(section)) return loc
  }
  if (munCfg.cities.Sydney === '*' || Object.values(munCfg.cities).includes('*')) {
    const star = Object.entries(munCfg.cities).find(([, v]) => v === '*')
    return star?.[0] ?? null
  }
  return null
}

export function countryHasLocationMap(countryId: string): boolean {
  return Boolean((locationMap as LocMap)[countryId])
}

export function locationMapSource(
  countryId: string,
): { en: string; pt: string } | null {
  return (locationMap as LocMap)[countryId]?.source ?? null
}

type PrincipalSec = {
  munCode: string
  munName: string
  zone: string
  section: string
}

/**
 * Fetch TSE ballot-box files for a country that has a curated location map
 * and aggregate presidential votes by voting city (e.g. Melbourne under Canberra).
 */
export async function fetchCountryLocations(
  countryId: string,
): Promise<CityResult[] | null> {
  const cfg = (locationMap as LocMap)[countryId]
  if (!cfg) return null

  const base = tseBaseUrl()
  const csUrl = `${base}/oficial/ele2026/arquivo-urna/${PLEITO}/config/zz/zz-p00${PLEITO}-cs.json`
  const cs = await fetchJson<{
    abr?: Array<{
      mu?: Array<{
        cd?: string
        nm?: string
        zon?: Array<{
          cd?: string
          sec?: Array<{ ns?: string; nsp?: string; da?: string }>
        }>
      }>
    }>
  }>(csUrl)

  const areaCodes = new Set(Object.keys(cfg.areas))
  const principals: PrincipalSec[] = []
  for (const mu of cs.abr?.[0]?.mu || []) {
    const munCode = pad(mu.cd || '', 5)
    if (!areaCodes.has(munCode)) continue
    for (const zon of mu.zon || []) {
      for (const sec of zon.sec || []) {
        if (!sec.ns || sec.nsp || !sec.da) continue
        principals.push({
          munCode,
          munName: mu.nm || cfg.areas[munCode]?.name || munCode,
          zone: pad(zon.cd || '1', 4),
          section: pad(sec.ns, 4),
        })
      }
    }
  }

  type Agg = {
    name: string
    area: string
    areaCode: string
    lula: number
    bolsonaro: number
    totalValid: number
    counted: number
    total: number
  }
  const aggregates = new Map<string, Agg>()

  // Pre-register cities so empty ones still appear if needed
  for (const [munCode, munCfg] of Object.entries(cfg.areas)) {
    for (const locName of Object.keys(munCfg.cities)) {
      const id = `${munCode}:${locName}`
      aggregates.set(id, {
        name: locName.toUpperCase(),
        area: munCfg.name,
        areaCode: munCode,
        lula: 0,
        bolsonaro: 0,
        totalValid: 0,
        counted: 0,
        total: 0,
      })
    }
  }

  // Coverage totals = principal sections actually present in EA16 (skip nsp aggregates).
  for (const p of principals) {
    const munCfg = cfg.areas[p.munCode]
    if (!munCfg) continue
    const locName = resolveLocation(p.section, munCfg)
    if (!locName) continue
    const agg = aggregates.get(`${p.munCode}:${locName}`)
    if (agg) agg.total += 1
  }

  await mapPool(principals, 12, async (p) => {
    const munCfg = cfg.areas[p.munCode]
    if (!munCfg) return
    const locName = resolveLocation(p.section, munCfg)
    if (!locName) return
    const id = `${p.munCode}:${locName}`
    const agg = aggregates.get(id)
    if (!agg) return

    const auxUrl =
      `${base}/oficial/ele2026/arquivo-urna/${PLEITO}/dados/zz/` +
      `${p.munCode}/${p.zone}/${p.section}/p00${PLEITO}-zz-m${p.munCode}-z${p.zone}-s${p.section}-aux.json`
    try {
      const aux = await fetchJson<{
        hashes?: Array<{ hash?: string; arq?: Array<{ nm?: string; tp?: string }> }>
      }>(auxUrl)
      const hash = aux.hashes?.[0]?.hash
      const buName = aux.hashes?.[0]?.arq?.find((a) => a.tp === 'bu')?.nm
      if (!hash || !buName) return
      const buUrl =
        `${base}/oficial/ele2026/arquivo-urna/${PLEITO}/dados/zz/` +
        `${p.munCode}/${p.zone}/${p.section}/${hash}/${buName}`
      const bu = await fetchBytes(buUrl)
      const votes = parseBuCandidateVotes(bu)
      const lula = votes['13'] || 0
      const bolsonaro = votes['22'] || 0
      const totalValid = Object.values(votes).reduce((a, b) => a + b, 0)
      agg.lula += lula
      agg.bolsonaro += bolsonaro
      agg.totalValid += totalValid
      agg.counted += 1
    } catch {
      /* skip failed section */
    }
  })

  const staged = [...aggregates.values()]
    .filter((a) => a.totalValid > 0 || a.counted > 0)
    .map((a) => {
      const y2026 = yearResult(a.lula, a.bolsonaro, a.totalValid)
      return {
        areaCode: a.areaCode,
        area: a.area,
        name: a.name,
        y2026,
        y2022: null as YearResult | null,
        swing: null as ReturnType<typeof swingOf>,
        coverage:
          a.total > 0
            ? ({ counted: a.counted, total: a.total } satisfies Coverage)
            : null,
      }
    })

  attachLoc2022(staged)

  const rows: CityResult[] = staged
    .map((a) =>
      withPlaceNames({
        code: `${a.areaCode}-${a.name}`,
        name: a.name,
        area: a.area,
        level: 'city' as const,
        y2026: a.y2026,
        y2022: a.y2022,
        swing: a.swing,
        coverage: a.coverage,
      }),
    )
    .sort((a, b) => b.y2026.totalValid - a.y2026.totalValid)

  return rows
}
