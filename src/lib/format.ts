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

export function metricValue(c: CountryResult, metric: MapMetric): number | null {
  if (c.status !== 'reported' || !c.y2026) return null
  switch (metric) {
    case 'marginSwing':
      return c.swing?.marginPp ?? null
    case 'lulaSwing':
      return c.swing?.lulaPp ?? null
    case 'bolsonaroSwing':
      return c.swing?.bolsonaroPp ?? null
    case 'margin2026':
      return c.y2026.lulaPct - c.y2026.bolsonaroPct
    case 'lulaPct2026':
      return c.y2026.lulaPct
    default:
      return null
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
