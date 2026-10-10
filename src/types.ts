export type Lang = 'en' | 'pt'

export type Localized = { en: string; pt: string }

export type YearResult = {
  lula: number
  bolsonaro: number
  totalValid: number
  lulaPct: number
  bolsonaroPct: number
  /** Registered voters (aptos) when known. */
  registered?: number
  /** Non-voters who did not turn out (abstenções). */
  abstentions?: number
  /** Blank votes (brancos). */
  blank?: number
  /** Null votes (nulos). */
  nullVotes?: number
  /**
   * Registered voters who did not cast a valid vote:
   * abstentions + blank + null (= aptos − válidos when components match).
   */
  noValidVote?: number
  /** Share of registered voters with no valid vote (0–100). */
  noValidVotePct?: number
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
  /** English display name (UI). */
  nameEn?: string
  /** Portuguese display name (UI). */
  namePt?: string
  /**
   * `area` = TSE ZZ município / consular area (e.g. CAMBERRA), or Brazilian UF.
   * `city` = voting city inside an overseas area (e.g. MELBOURNE).
   * `suburb` = Brazilian electoral zone (NR_ZONA) inside a municipality,
   * labeled by its main TSE neighborhoods (NM_BAIRRO) — Brazil-only 4th tab.
   */
  level?: 'area' | 'city' | 'suburb'
  /** Parent TSE area name when `level === 'city'`. */
  area?: string
  /** English display name for parent area. */
  areaEn?: string
  /** Portuguese display name for parent area. */
  areaPt?: string
  y2026: YearResult
  /** Present when historical open data exists for this place; else null/omitted. */
  y2022?: YearResult | null
  swing?: Swing | null
  coverage: Coverage | null
  /**
   * WGS84 centroid from TSE voting-local coordinates
   * (`eleitorado_local_votacao` NR_LATITUDE / NR_LONGITUDE). Used to place
   * Brazil city / neighborhood markers on the map.
   */
  lat?: number
  lon?: number
  /** Brazil only: number of electoral zones (neighborhood grain) in this city. */
  zoneCount?: number
}

export type CountryResult = {
  id: string
  countryEn: string
  countryPt: string
  iso3: string
  /** Short display code for English UI (FIFA/IOC-style when clearer than ISO3). */
  abbrevEn: string
  /** Short display code for Portuguese UI (Brazilian/Portuguese media form). */
  abbrevPt: string
  region: string
  y2022: YearResult
  y2026: YearResult | null
  swing: Swing | null
  /** Electoral sections counted/total when full or partial (e.g. 119/119, 26/29). */
  coverage: Coverage | null
  /** Official TSE EA20 ZZ areas (municípios / consular districts), or Brazilian UFs. */
  areas?: CityResult[]
  /**
   * Voting cities: overseas NM_LOCAL_VOTACAO splits, or Brazilian municipalities.
   * Brazil municipalities are lazy-loaded from brazil-cities.json.
   */
  cities?: CityResult[]
  /** Count of Brazilian municipalities when `cities` is not yet loaded. */
  cityCount?: number
  /**
   * Within-municipality grain for Brazil (electoral zones / suburb-equivalent).
   * Lazy-loaded from brazil-suburbs.json when the Zona tab needs them.
   */
  suburbs?: CityResult[]
  /** Count of Brazil zona rows when `suburbs` is not yet loaded. */
  suburbCount?: number
  /** Domestic Brazil (not overseas ZZ). Excluded from overseas aggregates by default. */
  domestic?: boolean
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
    /** Latest official TSE BR (domestic) presidential rollup from EA20 sync. */
    tseBr?: TseZzRollup
  }
  countries: CountryResult[]
}

/**
 * Heatmap / map coloring metrics.
 * Leader: who has more valid votes (share intensity from 50%→100%).
 * Difference: Lula % − Bolsonaro % within the same year (signed pp).
 * Changes: 2026% − 2022%.
 * Swing: Lula change − Bolsonaro change (red toward Lula, blue toward Bolsonaro).
 */
export type MapMetric =
  | 'leader2026'
  | 'leader2022'
  | 'difference2026'
  | 'difference2022'
  | 'lulaChange'
  | 'bolsonaroChange'
  | 'swing'
  | 'lulaPct2026'
  | 'bolsonaroPct2026'
  | 'lulaPct2022'
  | 'bolsonaroPct2022'
  | 'otherPct2026'
  | 'otherPct2022'
  | 'noValidVotePct2026'
  | 'noValidVotePct2022'
  | 'noValidVotes2026'
  | 'noValidVotes2022'
  | 'votes2026'
  | 'votes2022'
  | 'lulaVotes2026'
  | 'lulaVotes2022'
  | 'bolsonaroVotes2026'
  | 'bolsonaroVotes2022'

export const HEATMAP_METRICS: MapMetric[] = [
  'leader2026',
  'leader2022',
  'difference2026',
  'difference2022',
  'lulaChange',
  'bolsonaroChange',
  'swing',
  'lulaPct2026',
  'bolsonaroPct2026',
  'lulaPct2022',
  'bolsonaroPct2022',
  'otherPct2026',
  'otherPct2022',
  'noValidVotePct2026',
  'noValidVotePct2022',
  'noValidVotes2026',
  'noValidVotes2022',
  'votes2026',
  'votes2022',
  'lulaVotes2026',
  'lulaVotes2022',
  'bolsonaroVotes2026',
  'bolsonaroVotes2022',
]

export type SortKey =
  | 'votes2026'
  | 'votes2022'
  | 'lulaPct2026'
  | 'bolsonaroPct2026'
  | 'lulaPct2022'
  | 'bolsonaroPct2022'
  | 'difference2026'
  | 'difference2022'
  | 'otherPct2026'
  | 'otherPct2022'
  | 'noValidVotePct2026'
  | 'noValidVotePct2022'
  | 'noValidVotes2026'
  | 'noValidVotes2022'
  | 'lulaChange'
  | 'bolsonaroChange'
  | 'swing'
  | 'sections'
  | 'country'
  | 'region'
  | 'city'

export type HeatColumn =
  | 'lula2026'
  | 'bolso2026'
  | 'lula2022'
  | 'bolso2022'
  | 'difference2026'
  | 'difference2022'
  | 'other2026'
  | 'other2022'
  | 'noValidVote2026'
  | 'noValidVote2022'
  | 'lulaChange'
  | 'bolsonaroChange'
  | 'swing'
  | 'none'

export function heatColumnForMetric(metric: MapMetric): HeatColumn {
  switch (metric) {
    case 'leader2026':
    case 'leader2022':
      return 'none'
    case 'difference2026':
      return 'difference2026'
    case 'difference2022':
      return 'difference2022'
    case 'lulaChange':
      return 'lulaChange'
    case 'bolsonaroChange':
      return 'bolsonaroChange'
    case 'swing':
      return 'swing'
    case 'lulaPct2026':
    case 'lulaVotes2026':
      return 'lula2026'
    case 'bolsonaroPct2026':
    case 'bolsonaroVotes2026':
      return 'bolso2026'
    case 'lulaPct2022':
    case 'lulaVotes2022':
      return 'lula2022'
    case 'bolsonaroPct2022':
    case 'bolsonaroVotes2022':
      return 'bolso2022'
    case 'otherPct2026':
      return 'other2026'
    case 'otherPct2022':
      return 'other2022'
    case 'noValidVotePct2026':
    case 'noValidVotes2026':
      return 'noValidVote2026'
    case 'noValidVotePct2022':
    case 'noValidVotes2022':
      return 'noValidVote2022'
    case 'votes2026':
    case 'votes2022':
      return 'none'
  }
}
