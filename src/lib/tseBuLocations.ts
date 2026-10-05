import locationMap from '../data/tse-location-map.json'
import type { CityResult, Coverage, YearResult } from '../types'
import { tseBaseUrl } from './tseZzLive'

const PLEITO = '3220'

type MunLocConfig = {
  name: string
  locations: Record<string, string[] | '*'>
}

type CountryLocConfig = {
  source: { en: string; pt: string }
  municipalities: Record<string, MunLocConfig>
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
  for (const [loc, secs] of Object.entries(munCfg.locations)) {
    if (secs === '*') continue
    if (secs.includes(section)) return loc
  }
  if (munCfg.locations.Sydney === '*' || Object.values(munCfg.locations).includes('*')) {
    const star = Object.entries(munCfg.locations).find(([, v]) => v === '*')
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

  const munCodes = new Set(Object.keys(cfg.municipalities))
  const principals: PrincipalSec[] = []
  for (const mu of cs.abr?.[0]?.mu || []) {
    const munCode = pad(mu.cd || '', 5)
    if (!munCodes.has(munCode)) continue
    for (const zon of mu.zon || []) {
      for (const sec of zon.sec || []) {
        if (!sec.ns || sec.nsp || !sec.da) continue
        principals.push({
          munCode,
          munName: mu.nm || cfg.municipalities[munCode]?.name || munCode,
          zone: pad(zon.cd || '1', 4),
          section: pad(sec.ns, 4),
        })
      }
    }
  }

  type Agg = {
    name: string
    municipality: string
    municipalityCode: string
    lula: number
    bolsonaro: number
    totalValid: number
    counted: number
    total: number
  }
  const aggregates = new Map<string, Agg>()

  // Pre-register locations so empty ones still appear if needed
  for (const [munCode, munCfg] of Object.entries(cfg.municipalities)) {
    for (const locName of Object.keys(munCfg.locations)) {
      const id = `${munCode}:${locName}`
      aggregates.set(id, {
        name: locName.toUpperCase(),
        municipality: munCfg.name,
        municipalityCode: munCode,
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
    const munCfg = cfg.municipalities[p.munCode]
    if (!munCfg) continue
    const locName = resolveLocation(p.section, munCfg)
    if (!locName) continue
    const agg = aggregates.get(`${p.munCode}:${locName}`)
    if (agg) agg.total += 1
  }

  await mapPool(principals, 12, async (p) => {
    const munCfg = cfg.municipalities[p.munCode]
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

  const rows: CityResult[] = [...aggregates.values()]
    .filter((a) => a.totalValid > 0 || a.counted > 0)
    .map((a) => {
      const coverage: Coverage | null =
        a.total > 0 ? { counted: a.counted, total: a.total } : null
      return {
        code: `${a.municipalityCode}-${a.name}`,
        name: a.name,
        municipality: a.municipality,
        level: 'location' as const,
        y2026: yearResult(a.lula, a.bolsonaro, a.totalValid),
        y2022: null,
        swing: null,
        coverage,
      }
    })
    .sort((a, b) => b.y2026.totalValid - a.y2026.totalValid)

  return rows
}
