import type { CountryResult, Lang, MapMetric } from '../types'

export function fmtInt(n: number | null | undefined, lang: Lang): string {
  if (n == null || Number.isNaN(n)) return '—'
  return new Intl.NumberFormat(lang === 'pt' ? 'pt-BR' : 'en-US').format(n)
}

export function fmtPct(n: number | null | undefined, lang: Lang, digits = 1): string {
  if (n == null || Number.isNaN(n)) return '—'
  return `${new Intl.NumberFormat(lang === 'pt' ? 'pt-BR' : 'en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n)}%`
}

export function fmtShare(
  pct: number | null | undefined,
  votes: number | null | undefined,
  lang: Lang,
): string {
  if (pct == null || votes == null) return '—'
  return `${fmtPct(pct, lang)} (${fmtInt(votes, lang)})`
}

export function fmtCoverage(
  coverage: { counted: number; total: number } | null | undefined,
): string {
  if (!coverage || coverage.total <= 0) return '—'
  return `${coverage.counted}/${coverage.total}`
}

export function fmtPp(n: number | null | undefined, lang: Lang, digits = 1): string {
  if (n == null || Number.isNaN(n)) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${new Intl.NumberFormat(lang === 'pt' ? 'pt-BR' : 'en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n)} pp`
}

/** Signed vote delta, e.g. +1,000 or −250. */
export function fmtSignedInt(n: number | null | undefined, lang: Lang): string {
  if (n == null || Number.isNaN(n)) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${fmtInt(n, lang)}`
}

/** Change as "+2.4 pp (+1,077)". */
export function fmtPpWithVotes(
  pp: number | null | undefined,
  votesDelta: number | null | undefined,
  lang: Lang,
): string {
  if (pp == null) return '—'
  if (votesDelta == null) return fmtPp(pp, lang)
  return `${fmtPp(pp, lang)} (${fmtSignedInt(votesDelta, lang)})`
}

export function lulaVotesDelta(c: CountryResult): number | null {
  if (c.status !== 'reported' || !c.y2026) return null
  return c.y2026.lula - c.y2022.lula
}

export function bolsonaroVotesDelta(c: CountryResult): number | null {
  if (c.status !== 'reported' || !c.y2026) return null
  return c.y2026.bolsonaro - c.y2022.bolsonaro
}

export function countryName(c: CountryResult, lang: Lang): string {
  return lang === 'pt' ? c.countryPt : c.countryEn
}

/** Language-aware short country code for dense tables. */
export function countryAbbrev(c: CountryResult, lang: Lang): string {
  if (lang === 'pt') return c.abbrevPt || c.iso3
  return c.abbrevEn || c.iso3
}

/** Title-case TSE place labels as a Portuguese fallback (e.g. "NOVA YORK" → "Nova York"). */
export function titleCasePlaceName(name: string): string {
  return name
    .toLocaleLowerCase('pt-BR')
    .replace(/(^|[\s\-/'])(\S)/g, (_, sep: string, ch: string) => {
      return `${sep}${ch.toLocaleUpperCase('pt-BR')}`
    })
}

/**
 * Language-aware area/city label.
 * Prefers nameEn/namePt from the dataset; falls back to title-cased TSE `name`.
 */
export function cityDisplayName(
  place: string | { name: string; nameEn?: string; namePt?: string },
  lang: Lang = 'pt',
): string {
  if (typeof place === 'string') return titleCasePlaceName(place)
  if (lang === 'en') return place.nameEn || titleCasePlaceName(place.name)
  return place.namePt || titleCasePlaceName(place.name)
}

/** Lula change = 2026% − 2022%. */
export function lulaChange(c: CountryResult): number | null {
  if (c.status !== 'reported' || !c.y2026) return null
  return c.y2026.lulaPct - c.y2022.lulaPct
}

/** Bolsonaro change = 2026% − 2022%. */
export function bolsonaroChange(c: CountryResult): number | null {
  if (c.status !== 'reported' || !c.y2026) return null
  return c.y2026.bolsonaroPct - c.y2022.bolsonaroPct
}

/** Swing to Lula = Lula change − Bolsonaro change. */
export function swingToLula(c: CountryResult): number | null {
  const l = lulaChange(c)
  const b = bolsonaroChange(c)
  if (l == null || b == null) return null
  return l - b
}

export function metricValue(c: CountryResult, metric: MapMetric): number | null {
  switch (metric) {
    case 'leader2026': {
      if (c.status !== 'reported' || !c.y2026) return null
      const { lulaPct, bolsonaroPct } = c.y2026
      if (lulaPct > bolsonaroPct) return lulaPct
      if (bolsonaroPct > lulaPct) return -bolsonaroPct
      return 0
    }
    case 'leader2022': {
      const { lulaPct, bolsonaroPct } = c.y2022
      if (lulaPct > bolsonaroPct) return lulaPct
      if (bolsonaroPct > lulaPct) return -bolsonaroPct
      return 0
    }
    case 'lulaChange':
      return lulaChange(c)
    case 'bolsonaroChange':
      return bolsonaroChange(c)
    case 'swingToLula':
      return swingToLula(c)
    case 'lulaPct2026':
      return c.status === 'reported' && c.y2026 ? c.y2026.lulaPct : null
    case 'bolsonaroPct2026':
      return c.status === 'reported' && c.y2026 ? c.y2026.bolsonaroPct : null
    case 'lulaPct2022':
      return c.y2022.lulaPct
    case 'bolsonaroPct2022':
      return c.y2022.bolsonaroPct
  }
}

export function formatMetricValue(
  value: number | null,
  metric: MapMetric,
  lang: Lang,
): string {
  if (value == null) return '—'
  switch (metric) {
    case 'leader2026':
    case 'leader2022': {
      if (value === 0) return lang === 'pt' ? 'Empate' : 'Tie'
      const who =
        value > 0
          ? lang === 'pt'
            ? 'Lula'
            : 'Lula'
          : lang === 'pt'
            ? 'Bolsonaro'
            : 'Bolsonaro'
      return `${who} ${fmtPct(Math.abs(value), lang)}`
    }
    case 'lulaChange':
    case 'bolsonaroChange':
    case 'swingToLula':
      return fmtPp(value, lang)
    case 'lulaPct2026':
    case 'bolsonaroPct2026':
    case 'lulaPct2022':
    case 'bolsonaroPct2022':
      return fmtPct(value, lang)
  }
}

export function runningTotals(countries: CountryResult[]) {
  let lula = 0
  let bolsonaro = 0
  let valid = 0
  let reported = 0
  for (const c of countries) {
    if (c.status !== 'reported' || !c.y2026) continue
    lula += c.y2026.lula
    bolsonaro += c.y2026.bolsonaro
    valid += c.y2026.totalValid
    reported += 1
  }
  return { lula, bolsonaro, valid, reported }
}

export type RowTotals = {
  countries: number
  lula2026: number | null
  bolso2026: number | null
  valid2026: number | null
  lulaPct2026: number | null
  bolsoPct2026: number | null
  lula2022: number
  bolso2022: number
  valid2022: number
  lulaPct2022: number
  bolsoPct2022: number
  lulaChange: number | null
  bolsonaroChange: number | null
  swingToLula: number | null
  lulaVotesDelta: number | null
  bolsonaroVotesDelta: number | null
  sectionsCounted: number | null
  sectionsTotal: number | null
}

/** Aggregate table totals; change/swing use only countries with 2026 results. */
export function aggregateRows(rows: CountryResult[]): RowTotals {
  let lula2026 = 0
  let bolso2026 = 0
  let valid2026 = 0
  let has2026 = false
  let lula2022 = 0
  let bolso2022 = 0
  let valid2022 = 0
  let lula2022Comparable = 0
  let bolso2022Comparable = 0
  let valid2022Comparable = 0
  let sectionsCounted = 0
  let sectionsTotal = 0
  let hasSections = false

  for (const c of rows) {
    lula2022 += c.y2022.lula
    bolso2022 += c.y2022.bolsonaro
    valid2022 += c.y2022.totalValid
    if (c.status === 'reported' && c.y2026) {
      has2026 = true
      lula2026 += c.y2026.lula
      bolso2026 += c.y2026.bolsonaro
      valid2026 += c.y2026.totalValid
      lula2022Comparable += c.y2022.lula
      bolso2022Comparable += c.y2022.bolsonaro
      valid2022Comparable += c.y2022.totalValid
    }
    if (c.coverage) {
      hasSections = true
      sectionsCounted += c.coverage.counted
      sectionsTotal += c.coverage.total
    }
  }

  const lulaPct2022 = valid2022 ? (lula2022 / valid2022) * 100 : 0
  const bolsoPct2022 = valid2022 ? (bolso2022 / valid2022) * 100 : 0
  const lulaPct2026 = has2026 && valid2026 ? (lula2026 / valid2026) * 100 : null
  const bolsoPct2026 = has2026 && valid2026 ? (bolso2026 / valid2026) * 100 : null
  const lulaPct2022Comparable = valid2022Comparable
    ? (lula2022Comparable / valid2022Comparable) * 100
    : null
  const bolsoPct2022Comparable = valid2022Comparable
    ? (bolso2022Comparable / valid2022Comparable) * 100
    : null
  const lulaChange =
    lulaPct2026 != null && lulaPct2022Comparable != null
      ? lulaPct2026 - lulaPct2022Comparable
      : null
  const bolsonaroChange =
    bolsoPct2026 != null && bolsoPct2022Comparable != null
      ? bolsoPct2026 - bolsoPct2022Comparable
      : null
  const swingToLula =
    lulaChange != null && bolsonaroChange != null
      ? lulaChange - bolsonaroChange
      : null

  return {
    countries: rows.length,
    lula2026: has2026 ? lula2026 : null,
    bolso2026: has2026 ? bolso2026 : null,
    valid2026: has2026 ? valid2026 : null,
    lulaPct2026,
    bolsoPct2026,
    lula2022,
    bolso2022,
    valid2022,
    lulaPct2022,
    bolsoPct2022,
    lulaChange,
    bolsonaroChange,
    swingToLula,
    lulaVotesDelta: has2026 ? lula2026 - lula2022Comparable : null,
    bolsonaroVotesDelta: has2026 ? bolso2026 - bolso2022Comparable : null,
    sectionsCounted: hasSections ? sectionsCounted : null,
    sectionsTotal: hasSections ? sectionsTotal : null,
  }
}
