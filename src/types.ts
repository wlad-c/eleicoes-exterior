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
  /** Ballot-box coverage when published as full or partial (e.g. 119/119, 26/29). */
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

/** Heatmap / map coloring metrics. Default: margin2026. */
export type MapMetric =
  | 'marginSwing'
  | 'lulaSwing'
  | 'bolsonaroSwing'
  | 'margin2026'
  | 'margin2022'
  | 'lulaPct2026'
  | 'bolsonaroPct2026'
  | 'lulaPct2022'
  | 'bolsonaroPct2022'
  | 'votes2026'
  | 'votes2022'

export const HEATMAP_METRICS: MapMetric[] = [
  'margin2026',
  'margin2022',
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
  | 'lulaSwing'
  | 'country'
  | 'region'

/** Which table column receives the heatmap tint for a metric. */
export type HeatColumn =
  | 'lula2026'
  | 'bolso2026'
  | 'lula2022'
  | 'bolso2022'
  | 'lulaSwing'
  | 'none'

export function heatColumnForMetric(metric: MapMetric): HeatColumn {
  switch (metric) {
    case 'lulaSwing':
      return 'lulaSwing'
    case 'marginSwing':
    case 'bolsonaroSwing':
    case 'margin2026':
      return 'lula2026'
    case 'margin2022':
      return 'lula2022'
    case 'lulaPct2026':
    case 'votes2026':
      return 'lula2026'
    case 'bolsonaroPct2026':
      return 'bolso2026'
    case 'lulaPct2022':
    case 'votes2022':
      return 'lula2022'
    case 'bolsonaroPct2022':
      return 'bolso2022'
  }
}
