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

/** One overseas place: TSE ZZ area, or a voting city inside one. */
export type CityResult = {
  /** TSE area code, or `{area}-{CITY}` for voting-city rows. */
  code: string
  /** Official TSE / voting-place name (usually uppercase Portuguese). */
  name: string
  /**
   * `area` = TSE ZZ município / consular area (e.g. CAMBERRA).
   * `city` = voting city inside an area (e.g. MELBOURNE).
   */
  level?: 'area' | 'city'
  /** Parent TSE area name when `level === 'city'`. */
  area?: string
  y2026: YearResult
  /** Present when historical open data exists for this place; else null/omitted. */
  y2022?: YearResult | null
  swing?: Swing | null
  coverage: Coverage | null
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
  /** Official TSE EA20 ZZ areas (municípios / consular districts). */
  areas?: CityResult[]
  /**
   * Finer voting-city rows from TSE ballot boxes + location map
   * (e.g. Melbourne/Brisbane inside Canberra/Sydney).
   */
  cities?: CityResult[]
  notes: string
  status: CountryStatus
}

export type TseZzRollup = {
  election: string
  fetchedAt: string
  sectionsCounted: number
  sectionsTotal: number
  sectionsPct: number
  lula: number
  bolsonaro: number
  totalValid: number
  url: string
}

export type ResultsData = {
  meta: {
    title: Localized
    subtitle: Localized
    updatedAt: string
    sources: { name: string; url: string; role?: Localized }[]
    defaultMapMetric: string
    candidates: {
      lula: Localized
      bolsonaro2022: Localized
      bolsonaro2026: Localized
    }
    /** Latest official TSE ZZ (overseas) presidential rollup from EA20 sync. */
    tseZz?: TseZzRollup
  }
  countries: CountryResult[]
}

/**
 * Heatmap / map coloring metrics.
 * Leader: who has more valid votes (share intensity from 50%→100%).
 * Changes: 2026% − 2022%.
 * Swing to Lula: Lula change − Bolsonaro change.
 */
export type MapMetric =
  | 'leader2026'
  | 'leader2022'
  | 'lulaChange'
  | 'bolsonaroChange'
  | 'swingToLula'
  | 'lulaPct2026'
  | 'bolsonaroPct2026'
  | 'lulaPct2022'
  | 'bolsonaroPct2022'

export const HEATMAP_METRICS: MapMetric[] = [
  'leader2026',
  'leader2022',
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
  | 'lulaPct2022'
  | 'bolsonaroPct2022'
  | 'lulaChange'
  | 'bolsonaroChange'
  | 'swingToLula'
  | 'sections'
  | 'country'
  | 'region'
  | 'city'

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
    case 'leader2026':
    case 'leader2022':
      return 'none'
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
