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

export function countryName(c: CountryResult, lang: Lang): string {
  return lang === 'pt' ? c.countryPt : c.countryEn
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
