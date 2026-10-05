import { cityDisplayName, countryName } from './format'
import type { CityResult, CountryResult, Lang, SortKey } from '../types'

export type CityTableRow = CityResult & {
  countryId: string
}

/** Official TSE ZZ areas only (e.g. CAMBERRA, SYDNEY). */
export function areaRowsForCountry(country: CountryResult): CityResult[] {
  return (country.areas ?? []).map((c) => ({
    ...c,
    level: c.level ?? ('area' as const),
  }))
}

export function taggedAreaRows(country: CountryResult): CityTableRow[] {
  return areaRowsForCountry(country).map((row) => ({
    ...row,
    countryId: country.id,
  }))
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
  return breakdownRowsForCountry(country, liveCities).map((row) => ({
    ...row,
    countryId: country.id,
  }))
}

export function cityCountForCountry(country: CountryResult): number {
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

export function citySwingToLula(c: CityResult): number | null {
  if (c.swing != null) return c.swing.lulaPp - c.swing.bolsonaroPp
  const lula = cityLulaChange(c)
  const bolso = cityBolsonaroChange(c)
  if (lula == null || bolso == null) return null
  return lula - bolso
}

export function citySwingToBolsonaro(c: CityResult): number | null {
  if (c.swing != null) return c.swing.bolsonaroPp - c.swing.lulaPp
  const lula = cityLulaChange(c)
  const bolso = cityBolsonaroChange(c)
  if (lula == null || bolso == null) return null
  return bolso - lula
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
    case 'lulaChange':
      return cityLulaChange(row) ?? Number.NaN
    case 'bolsonaroChange':
      return cityBolsonaroChange(row) ?? Number.NaN
    case 'swingToLula':
      return citySwingToLula(row) ?? Number.NaN
    case 'swingToBolsonaro':
      return citySwingToBolsonaro(row) ?? Number.NaN
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
  const locale = lang === 'pt' ? 'pt' : 'en'
  if (typeof av === 'string' && typeof bv === 'string') {
    const cmp = av.localeCompare(bv, locale, { sensitivity: 'base' })
    if (cmp !== 0) return cmp
    return cityDisplayName(a, lang).localeCompare(cityDisplayName(b, lang), locale, {
      sensitivity: 'base',
    })
  }
  const an = av as number
  const bn = bv as number
  if (Number.isNaN(an) && Number.isNaN(bn)) {
    return cityDisplayName(a, lang).localeCompare(cityDisplayName(b, lang), locale, {
      sensitivity: 'base',
    })
  }
  if (Number.isNaN(an)) return 1
  if (Number.isNaN(bn)) return -1
  if (an === bn) {
    return cityDisplayName(a, lang).localeCompare(cityDisplayName(b, lang), locale, {
      sensitivity: 'base',
    })
  }
  return an - bn
}
