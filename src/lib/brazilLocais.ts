/**
 * Brazil voting-place (local de votação) runoff grain — Nexo-style point map.
 * One row per NR_LOCAL_VOTACAO; BUs (seções) at the same school are aggregated.
 */
import type { CityResult, Coverage, Swing, YearResult } from '../types'
import type { ElectionRound } from './electionRound'

export type BrazilLocalRow = CityResult & {
  level: 'suburb'
  /** Parent municipality code `UF-IBGE`. */
  cityCode: string
  /** Electoral zone padded to 3 digits. */
  zona: string
  /** TSE NR_LOCAL_VOTACAO padded to 4 digits. */
  nrLocal: string
  /** Number of seções (BUs) aggregated into this local. */
  secaoCount?: number
  bairro?: string
}

type CompactLocal = [
  mun: string,
  zona: string,
  nrLocal: string,
  name: string,
  lat: number | null,
  lon: number | null,
  lula26: number,
  bolso26: number,
  valid26: number,
  lula22: number,
  bolso22: number,
  valid22: number,
  secoes: number,
  munName: string,
  bairro: string,
]

type UfPayload = {
  uf: string
  grain: string
  round: number
  count: number
  withCoords: number
  cols: string[]
  locais: CompactLocal[]
}

type IndexPayload = {
  countryId: string
  grain: string
  round: number
  election: string
  updatedAt: string
  count: number
  withCoords: number
  with2022: number
  ufs: { uf: string; count: number; withCoords: number; bytes: number }[]
}

const UF_LIST = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const

function round1(n: number): number {
  return Math.round(n * 100) / 100
}

function yearOf(lula: number, bolsonaro: number, totalValid: number): YearResult {
  return {
    lula,
    bolsonaro,
    totalValid,
    lulaPct: totalValid ? round1((lula / totalValid) * 100) : 0,
    bolsonaroPct: totalValid ? round1((bolsonaro / totalValid) * 100) : 0,
  }
}

function swingOf(y2022: YearResult | null, y2026: YearResult): Swing | null {
  if (!y2022 || !y2022.totalValid) return null
  const lulaPp = round1(y2026.lulaPct - y2022.lulaPct)
  const bolsonaroPp = round1(y2026.bolsonaroPct - y2022.bolsonaroPct)
  return {
    lulaPp,
    bolsonaroPp,
    marginPp: round1(lulaPp - bolsonaroPp),
  }
}

function titleCasePt(name: string): string {
  return String(name || '')
    .toLocaleLowerCase('pt-BR')
    .replace(
      /(^|[\s\-'/])(\S)/g,
      (_, a: string, b: string) => a + b.toLocaleUpperCase('pt-BR'),
    )
}

function expandRow(uf: string, row: CompactLocal): BrazilLocalRow {
  const [
    mun,
    zona,
    nrLocal,
    name,
    lat,
    lon,
    lula26,
    bolso26,
    valid26,
    lula22,
    bolso22,
    valid22,
    secoes,
    munName,
    bairro,
  ] = row
  const y2026 = yearOf(lula26, bolso26, valid26)
  const y2022 =
    valid22 > 0 ? yearOf(lula22, bolso22, valid22) : null
  const cityCode = `${uf}-${mun}`
  const prettyMun = titleCasePt(munName || mun)
  const prettyName = titleCasePt(name)
  const coverage: Coverage = { counted: secoes || 0, total: secoes || 0 }
  const areaPt = `${uf} · ${prettyMun}`
  const out: BrazilLocalRow = {
    code: `${cityCode}-Z${zona}-L${nrLocal}`,
    name: prettyName,
    nameEn: prettyName,
    namePt: prettyName,
    level: 'suburb',
    area: `${uf} · ${munName || mun}`,
    areaEn: areaPt,
    areaPt,
    y2026,
    y2022,
    swing: swingOf(y2022, y2026),
    coverage,
    cityCode,
    zona,
    nrLocal,
    secaoCount: secoes || undefined,
    bairro: bairro || undefined,
  }
  if (lat != null && lon != null) {
    out.lat = lat
    out.lon = lon
  }
  return out
}

function locaisBaseUrl(): string {
  return `${import.meta.env.BASE_URL}data/brazil-locais-runoff`
}

const ufCache = new Map<string, BrazilLocalRow[]>()
const ufInflight = new Map<string, Promise<BrazilLocalRow[]>>()
let indexCache: IndexPayload | null = null
let allCache: BrazilLocalRow[] | null = null
let allInflight: Promise<BrazilLocalRow[] | null> | null = null

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export async function fetchBrazilLocaisIndex(): Promise<IndexPayload | null> {
  if (indexCache) return indexCache
  const doc = await fetchJson<IndexPayload>(`${locaisBaseUrl()}/index.json`)
  if (doc) indexCache = doc
  return doc
}

export async function fetchBrazilLocaisUf(
  uf: string,
): Promise<BrazilLocalRow[]> {
  const key = uf.toUpperCase()
  const hit = ufCache.get(key)
  if (hit) return hit
  const inflight = ufInflight.get(key)
  if (inflight) return inflight
  const p = (async () => {
    const doc = await fetchJson<UfPayload>(`${locaisBaseUrl()}/${key}.json`)
    const rows = (doc?.locais ?? []).map((r) => expandRow(key, r))
    ufCache.set(key, rows)
    ufInflight.delete(key)
    return rows
  })()
  ufInflight.set(key, p)
  return p
}

/** Load every UF (national Nexo-style layer). */
export async function fetchAllBrazilLocais(): Promise<BrazilLocalRow[] | null> {
  if (allCache) return allCache
  if (allInflight) return allInflight
  allInflight = (async () => {
    const index = await fetchBrazilLocaisIndex()
    const ufs = index?.ufs?.map((u) => u.uf) ?? [...UF_LIST]
    const chunks = await Promise.all(ufs.map((uf) => fetchBrazilLocaisUf(uf)))
    const all = chunks.flat()
    if (!all.length) {
      allInflight = null
      return null
    }
    allCache = all
    allInflight = null
    return all
  })()
  return allInflight
}

export function locaisForCity(
  locais: BrazilLocalRow[] | null | undefined,
  cityCode: string,
): BrazilLocalRow[] {
  if (!locais?.length) return []
  const prefix = `${cityCode}-`
  return locais.filter((l) => l.code.startsWith(prefix))
}

export function locaisForUf(
  locais: BrazilLocalRow[] | null | undefined,
  uf: string,
): BrazilLocalRow[] {
  if (!locais?.length) return []
  const u = uf.toUpperCase()
  return locais.filter((l) => l.code.startsWith(`${u}-`))
}

/** Prefetch helper for hover/focus on the Locais tab. */
export function prefetchBrazilLocais(round: ElectionRound = '2'): void {
  if (round !== '2') return
  void fetchAllBrazilLocais()
}

export function brazilLocaisReady(): boolean {
  return allCache != null && allCache.length > 0
}
