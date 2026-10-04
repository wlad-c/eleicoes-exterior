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

export type CountryResult = {
  id: string
  countryEn: string
  countryPt: string
  iso3: string
  region: string
  y2022: YearResult
  y2026: YearResult | null
  swing: Swing | null
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

export type MapMetric =
  | 'marginSwing'
  | 'lulaSwing'
  | 'bolsonaroSwing'
  | 'margin2026'
  | 'lulaPct2026'

export type SortKey =
  | 'votes2026'
  | 'votes2022'
  | 'lulaPct2026'
  | 'bolsonaroPct2026'
  | 'marginSwing'
  | 'country'
  | 'region'
