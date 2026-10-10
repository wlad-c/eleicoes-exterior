import { collatorFor } from './collator'
import {
  noValidVotePct,
  noValidVotes,
  cityDisplayName,
  countryName,
  otherPct,
  withElectorate,
} from './format'
import { foldForSearch } from './searchText'
import type {
  CityResult,
  CountryResult,
  Coverage,
  Lang,
  SortKey,
  Swing,
  YearResult,
} from '../types'

export type CityTableRow = CityResult & {
  countryId: string
  /** When set, this suburb row aggregates multiple electoral zones. */
  groupedZoneCount?: number
}

function asTagged(row: CityResult, countryId: string): CityTableRow {
  const tagged = row as CityTableRow
  if (tagged.countryId === countryId) return tagged
  return { ...row, countryId }
}

/** Official TSE ZZ areas only (e.g. CAMBERRA, SYDNEY). */
export function areaRowsForCountry(country: CountryResult): CityResult[] {
  return (country.areas ?? []).map((c) => ({
    ...c,
    level: c.level ?? ('area' as const),
  }))
}

export function taggedAreaRows(country: CountryResult): CityTableRow[] {
  return areaRowsForCountry(country).map((row) => asTagged(row, country.id))
}

/**
 * Voting cities + unsplit TSE areas for one country
 * (e.g. MELBOURNE/PERTH under CAMBERRA, plus other areas as-is).
 */
export function breakdownRowsForCountry(
  country: CountryResult,
  liveCities?: CityResult[] | null,
): CityResult[] {
  const locs = liveCities?.length
    ? liveCities
    : country.cities?.length
      ? country.cities
      : null
  if (!locs?.length) return areaRowsForCountry(country)
  const covered = new Set(locs.map((l) => (l.area || '').toUpperCase()))
  const extras = areaRowsForCountry(country)
    .filter((c) => !covered.has(c.name.toUpperCase()))
    .map((c) => ({ ...c, level: 'area' as const }))
  return [...locs, ...extras]
}

export function taggedBreakdownRows(
  country: CountryResult,
  liveCities?: CityResult[] | null,
): CityTableRow[] {
  return breakdownRowsForCountry(country, liveCities).map((row) =>
    asTagged(row, country.id),
  )
}

/** Brazilian municipalities for the City tab (domestic). */
export function brazilCityRowsForCountry(country: CountryResult): CityResult[] {
  if (!country.domestic) return []
  return country.cities ?? []
}

export function taggedBrazilCityRows(country: CountryResult): CityTableRow[] {
  const rows = brazilCityRowsForCountry(country)
  if (!rows.length) return []
  // Lazy-loaded Brazil payloads are stamped with countryId once on fetch.
  if ((rows[0] as CityTableRow).countryId === country.id) {
    return rows as CityTableRow[]
  }
  return rows.map((row) => asTagged(row, country.id))
}

/** Within-municipality voting locals (Brazil Suburb tab). */
export function suburbRowsForCountry(country: CountryResult): CityResult[] {
  return country.suburbs ?? []
}

export function taggedSuburbRows(country: CountryResult): CityTableRow[] {
  const rows = suburbRowsForCountry(country)
  if (!rows.length) return []
  if ((rows[0] as CityTableRow).countryId === country.id) {
    return rows as CityTableRow[]
  }
  return rows.map((row) => asTagged(row, country.id))
}

/** Municipality key from suburb code `UF-IBGE-Zxxx` → `UF-IBGE`. */
export function suburbMunicipalityKey(row: { code: string }): string {
  const m = row.code.trim().toUpperCase().match(/^([A-Z]{2}-\d+)/)
  return m ? m[1] : row.code.trim().toUpperCase()
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function yearFromVotes(
  lula: number,
  bolsonaro: number,
  totalValid: number,
  registered?: number | null,
  abstentions?: number | null,
  blank?: number | null,
  nullVotes?: number | null,
): YearResult {
  return withElectorate(
    {
      lula,
      bolsonaro,
      totalValid,
      lulaPct: totalValid ? round1((lula / totalValid) * 100) : 0,
      bolsonaroPct: totalValid ? round1((bolsonaro / totalValid) * 100) : 0,
    },
    registered,
    abstentions,
    blank,
    nullVotes,
  )
}

function swingFromYears(
  y2026: YearResult,
  y2022: YearResult | null | undefined,
): Swing | null {
  if (!y2022) return null
  const lulaPp = round1(y2026.lulaPct - y2022.lulaPct)
  const bolsonaroPp = round1(y2026.bolsonaroPct - y2022.bolsonaroPct)
  return {
    lulaPp,
    bolsonaroPp,
    marginPp: round1(lulaPp - bolsonaroPp),
  }
}

function stripZoneFromParent(area: string): string {
  return area.replace(/\s*·\s*(?:Zona|Zone)\s*\d+\s*$/i, '').trim()
}

function zoneCountLabel(count: number, lang: Lang): string {
  if (lang === 'pt') {
    return count === 1 ? '1 zona' : `${count} zonas`
  }
  return count === 1 ? '1 zone' : `${count} zones`
}

/**
 * Merge Bairro rows that share the same neighborhood label inside the same
 * municipality (e.g. several "Campo Grande" zones in Rio). Different cities
 * or UFs stay separate.
 */
export function groupSuburbRowsByNeighborhood(
  rows: CityTableRow[],
  lang: Lang,
): CityTableRow[] {
  if (rows.length <= 1) return rows
  const groups = new Map<string, CityTableRow[]>()
  for (const row of rows) {
    const key = `${row.countryId}::${suburbMunicipalityKey(row)}::${foldForSearch(row.name)}`
    const list = groups.get(key)
    if (list) list.push(row)
    else groups.set(key, [row])
  }

  const out: CityTableRow[] = []
  for (const members of groups.values()) {
    if (members.length === 1) {
      out.push(members[0]!)
      continue
    }
    members.sort((a, b) => a.code.localeCompare(b.code))
    const head = members[0]!
    let lula = 0
    let bolso = 0
    let valid = 0
    let registered26 = 0
    let abstentions26 = 0
    let blank26 = 0
    let null26 = 0
    let hasElectorate26 = false
    let hasParts26 = false
    let lula22 = 0
    let bolso22 = 0
    let valid22 = 0
    let registered22 = 0
    let abstentions22 = 0
    let blank22 = 0
    let null22 = 0
    let hasElectorate22 = false
    let hasParts22 = false
    let has22 = false
    let counted = 0
    let total = 0
    let hasCov = false
    for (const m of members) {
      lula += m.y2026.lula
      bolso += m.y2026.bolsonaro
      valid += m.y2026.totalValid
      const nv26 = noValidVotes(m.y2026)
      if (m.y2026.registered != null && nv26 != null) {
        hasElectorate26 = true
        registered26 += m.y2026.registered
        if (
          m.y2026.abstentions != null &&
          m.y2026.blank != null &&
          m.y2026.nullVotes != null
        ) {
          hasParts26 = true
          abstentions26 += m.y2026.abstentions
          blank26 += m.y2026.blank
          null26 += m.y2026.nullVotes
        }
      }
      if (m.y2022) {
        has22 = true
        lula22 += m.y2022.lula
        bolso22 += m.y2022.bolsonaro
        valid22 += m.y2022.totalValid
        const nv22 = noValidVotes(m.y2022)
        if (m.y2022.registered != null && nv22 != null) {
          hasElectorate22 = true
          registered22 += m.y2022.registered
          if (
            m.y2022.abstentions != null &&
            m.y2022.blank != null &&
            m.y2022.nullVotes != null
          ) {
            hasParts22 = true
            abstentions22 += m.y2022.abstentions
            blank22 += m.y2022.blank
            null22 += m.y2022.nullVotes
          }
        }
      }
      if (m.coverage) {
        hasCov = true
        counted += m.coverage.counted
        total += m.coverage.total
      }
    }
    const y2026 = yearFromVotes(
      lula,
      bolso,
      valid,
      hasElectorate26 ? registered26 : null,
      hasParts26 ? abstentions26 : null,
      hasParts26 ? blank26 : null,
      hasParts26 ? null26 : null,
    )
    const y2022 = has22
      ? yearFromVotes(
          lula22,
          bolso22,
          valid22,
          hasElectorate22 ? registered22 : null,
          hasParts22 ? abstentions22 : null,
          hasParts22 ? blank22 : null,
          hasParts22 ? null22 : null,
        )
      : null
    const coverage: Coverage | null = hasCov ? { counted, total } : null
    const zoneLabel = zoneCountLabel(members.length, lang)
    const areaBase = stripZoneFromParent(head.area || '')
    const areaEnBase = stripZoneFromParent(head.areaEn || head.area || '')
    const areaPtBase = stripZoneFromParent(head.areaPt || head.area || '')
    out.push({
      ...head,
      code: `${suburbMunicipalityKey(head)}-${foldForSearch(head.name).replace(/\s+/g, '-')}`,
      y2026,
      y2022,
      swing: swingFromYears(y2026, y2022),
      coverage,
      area: areaBase ? `${areaBase} · ${zoneLabel}` : zoneLabel,
      areaEn: areaEnBase
        ? `${areaEnBase} · ${zoneCountLabel(members.length, 'en')}`
        : zoneCountLabel(members.length, 'en'),
      areaPt: areaPtBase
        ? `${areaPtBase} · ${zoneCountLabel(members.length, 'pt')}`
        : zoneCountLabel(members.length, 'pt'),
      groupedZoneCount: members.length,
    })
  }
  return out
}

export function cityCountForCountry(country: CountryResult): number {
  if (country.domestic) {
    return (country.cities?.length ?? country.cityCount ?? 0) || 0
  }
  return breakdownRowsForCountry(country).length
}

export function cityLulaChange(c: CityResult): number | null {
  if (c.swing != null) return c.swing.lulaPp
  if (c.y2022 && c.y2026) return c.y2026.lulaPct - c.y2022.lulaPct
  return null
}

export function cityBolsonaroChange(c: CityResult): number | null {
  if (c.swing != null) return c.swing.bolsonaroPp
  if (c.y2022 && c.y2026) return c.y2026.bolsonaroPct - c.y2022.bolsonaroPct
  return null
}

/** Absolute vote delta vs 2022 (for "+2.4 pp (+1,077)" cells). */
export function cityLulaVotesDelta(c: CityResult): number | null {
  if (!c.y2022 || !c.y2026) return null
  return c.y2026.lula - c.y2022.lula
}

export function cityBolsonaroVotesDelta(c: CityResult): number | null {
  if (!c.y2022 || !c.y2026) return null
  return c.y2026.bolsonaro - c.y2022.bolsonaro
}

export function cityDifference2026(c: CityResult): number | null {
  if (!c.y2026) return null
  return c.y2026.lulaPct - c.y2026.bolsonaroPct
}

export function cityDifference2022(c: CityResult): number | null {
  if (!c.y2022) return null
  return c.y2022.lulaPct - c.y2022.bolsonaroPct
}

/** Swing = Lula Δ − Bolsonaro Δ (positive toward Lula). */
export function citySwing(c: CityResult): number | null {
  if (c.swing != null) return c.swing.lulaPp - c.swing.bolsonaroPp
  const lula = cityLulaChange(c)
  const bolso = cityBolsonaroChange(c)
  if (lula == null || bolso == null) return null
  return lula - bolso
}

function citySortValue(
  row: CityTableRow,
  country: CountryResult | undefined,
  key: SortKey,
  lang: Lang,
): number | string {
  switch (key) {
    case 'city':
      return cityDisplayName(row, lang)
    case 'country':
      return country ? countryName(country, lang) : row.countryId
    case 'region':
      return country?.region ?? ''
    case 'votes2026':
      return row.y2026?.totalValid ?? -1
    case 'votes2022':
      return row.y2022?.totalValid ?? -1
    case 'lulaPct2026':
      return row.y2026?.lulaPct ?? Number.NaN
    case 'bolsonaroPct2026':
      return row.y2026?.bolsonaroPct ?? Number.NaN
    case 'lulaPct2022':
      return row.y2022?.lulaPct ?? Number.NaN
    case 'bolsonaroPct2022':
      return row.y2022?.bolsonaroPct ?? Number.NaN
    case 'otherPct2026':
      return otherPct(row.y2026) ?? Number.NaN
    case 'otherPct2022':
      return otherPct(row.y2022) ?? Number.NaN
    case 'noValidVotePct2026':
      return noValidVotePct(row.y2026) ?? Number.NaN
    case 'noValidVotePct2022':
      return noValidVotePct(row.y2022) ?? Number.NaN
    case 'noValidVotes2026':
      return noValidVotes(row.y2026) ?? Number.NaN
    case 'noValidVotes2022':
      return noValidVotes(row.y2022) ?? Number.NaN
    case 'difference2026':
      return cityDifference2026(row) ?? Number.NaN
    case 'difference2022':
      return cityDifference2022(row) ?? Number.NaN
    case 'lulaChange':
      return cityLulaChange(row) ?? Number.NaN
    case 'bolsonaroChange':
      return cityBolsonaroChange(row) ?? Number.NaN
    case 'swing':
      return citySwing(row) ?? Number.NaN
    case 'sections':
      return row.coverage && row.coverage.total > 0
        ? row.coverage.counted / row.coverage.total
        : Number.NaN
  }
}

export function compareCityRows(
  a: CityTableRow,
  b: CityTableRow,
  countries: Map<string, CountryResult>,
  key: SortKey,
  lang: Lang,
): number {
  const ca = countries.get(a.countryId)
  const cb = countries.get(b.countryId)
  const av = citySortValue(a, ca, key, lang)
  const bv = citySortValue(b, cb, key, lang)
  const collator = collatorFor(lang)
  if (typeof av === 'string' && typeof bv === 'string') {
    const cmp = collator.compare(av, bv)
    if (cmp !== 0) return cmp
    return collator.compare(cityDisplayName(a, lang), cityDisplayName(b, lang))
  }
  const an = av as number
  const bn = bv as number
  if (Number.isNaN(an) && Number.isNaN(bn)) {
    return collator.compare(cityDisplayName(a, lang), cityDisplayName(b, lang))
  }
  if (Number.isNaN(an)) return 1
  if (Number.isNaN(bn)) return -1
  if (an === bn) {
    // Stable, cheap tie-break for large Brazil tables (many shared vote totals).
    if (a.code !== b.code) return a.code < b.code ? -1 : 1
    return collator.compare(cityDisplayName(a, lang), cityDisplayName(b, lang))
  }
  return an - bn
}
