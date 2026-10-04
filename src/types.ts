export type Lang = 'en' | 'pt'

export type Localized = { en: string; pt: string }

export type YearResult = {
  lula: number
  bolsonaro: number
  totalValid: number
  lulaPct: number
  bolsonaroPct: number
}

export type Swing = {
  lulaPp: number
  bolsonaroPp: number
  marginPp: number
}

export type CountryStatus = 'reported' | 'pending'

export type Coverage = {
  counted: number
  total: number
}

export type CountryResult = {
  id: string
  countryEn: string
  countryPt: string
  iso3: string
  region: string
  y2022: YearResult
  y2026: YearResult | null
  swing: Swing | null
  /** Electoral sections counted/total when full or partial (e.g. 119/119, 26/29). */
  coverage: Coverage | null
  notes: string
  status: CountryStatus
}

export type ResultsData = {
  meta: {
    title: Localized
    subtitle: Localized
    updatedAt: string
    sources: { name: string; url: string }[]
    defaultMapMetric: string
    candidates: {
      lula: Localized
      bolsonaro2022: Localized
      bolsonaro2026: Localized
    }
  }
  countries: CountryResult[]
}

/**
 * Heatmap / map coloring metrics.
 * Changes: 2026% − 2022%.
 * Swing to Lula: Lula change − Bolsonaro change.
 */
export type MapMetric =
  | 'lulaChange'
  | 'bolsonaroChange'
  | 'swingToLula'
  | 'lulaPct2026'
  | 'bolsonaroPct2026'
  | 'lulaPct2022'
  | 'bolsonaroPct2022'

export const HEATMAP_METRICS: MapMetric[] = [
  'lulaChange',
  'bolsonaroChange',
  'swingToLula',
  'lulaPct2026',
  'bolsonaroPct2026',
  'lulaPct2022',
  'bolsonaroPct2022',
]

export type SortKey =
  | 'votes2026'
  | 'votes2022'
  | 'lulaPct2026'
  | 'bolsonaroPct2026'
  | 'lulaChange'
  | 'bolsonaroChange'
  | 'swingToLula'
  | 'country'
  | 'region'

export type HeatColumn =
  | 'lula2026'
  | 'bolso2026'
  | 'lula2022'
  | 'bolso2022'
  | 'lulaChange'
  | 'bolsonaroChange'
  | 'swingToLula'
  | 'none'

export function heatColumnForMetric(metric: MapMetric): HeatColumn {
  switch (metric) {
    case 'lulaChange':
      return 'lulaChange'
    case 'bolsonaroChange':
      return 'bolsonaroChange'
    case 'swingToLula':
      return 'swingToLula'
    case 'lulaPct2026':
      return 'lula2026'
    case 'bolsonaroPct2026':
      return 'bolso2026'
    case 'lulaPct2022':
      return 'lula2022'
    case 'bolsonaroPct2022':
      return 'bolso2022'
  }
}
