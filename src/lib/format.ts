import type {
  CountryResult,
  CountryStatus,
  Lang,
  MapMetric,
  Swing,
  YearResult,
} from '../types'

/** Minimal vote shape for map/table metrics (country or place rows). */
export type VoteLike = {
  status?: CountryStatus
  y2026?: YearResult | null
  y2022?: YearResult | null
  swing?: Swing | null
}

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
  opts?: { compact?: boolean },
): string {
  if (pct == null || votes == null) return '—'
  if (opts?.compact) return fmtPct(pct, lang)
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
  opts?: { compact?: boolean },
): string {
  if (pp == null) return '—'
  if (opts?.compact || votesDelta == null) return fmtPp(pp, lang)
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

function round1(n: number): number {
  return Math.round(n * 100) / 100
}

/** Valid votes for candidates other than Lula / Bolsonaro. */
export function otherVotes(y: YearResult | null | undefined): number | null {
  if (!y) return null
  return Math.max(0, y.totalValid - y.lula - y.bolsonaro)
}

/** Other-candidate share of valid votes (0–100). */
export function otherPct(y: YearResult | null | undefined): number | null {
  if (!y || y.totalValid <= 0) return null
  return round1(((y.totalValid - y.lula - y.bolsonaro) / y.totalValid) * 100)
}

/** Abstention share of registered voters when electorate fields exist. */
export function abstentionPct(y: YearResult | null | undefined): number | null {
  if (!y) return null
  if (y.abstentionPct != null && !Number.isNaN(y.abstentionPct)) {
    return y.abstentionPct
  }
  if (y.registered != null && y.registered > 0 && y.abstentions != null) {
    return round1((y.abstentions / y.registered) * 100)
  }
  return null
}

/** Attach TSE electorate (aptos / abstenções) onto a YearResult. */
export function withElectorate(
  y: YearResult,
  registered: number | null | undefined,
  abstentions: number | null | undefined,
): YearResult {
  if (registered == null || registered <= 0 || abstentions == null) return y
  return {
    ...y,
    registered,
    abstentions,
    abstentionPct: round1((abstentions / registered) * 100),
  }
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

/** Standard IBGE/TSE UF code (AC…TO) when the place is a Brazilian state/DF row. */
export function brazilUfAbbrev(place: {
  code?: string
  name: string
}): string | null {
  const code = (place.code || place.name || '').trim().toUpperCase()
  return /^[A-Z]{2}$/.test(code) ? code : null
}

/**
 * Area-tab place label. On compact viewports, Brazilian UFs show the 2-letter
 * abbreviation (SP, RJ) instead of a truncated full state name.
 */
export function areaDisplayName(
  place: {
    code?: string
    name: string
    nameEn?: string
    namePt?: string
  },
  lang: Lang,
  opts?: { domestic?: boolean; preferUf?: boolean },
): string {
  if (opts?.preferUf && opts.domestic) {
    const uf = brazilUfAbbrev(place)
    if (uf) return uf
  }
  return cityDisplayName(place, lang)
}

/** Parent UF · municipality · zone label for Brazil neighborhood (Bairro tab) rows. */
export function placeParentLabel(
  place: { area?: string; areaEn?: string; areaPt?: string },
  lang: Lang,
): string {
  if (lang === 'en') return place.areaEn || place.area || ''
  return place.areaPt || place.area || ''
}

/**
 * Secondary line under City-tab place names.
 * Brazil municipalities → UF code (SP, RJ). Overseas voting cities → parent
 * consular area when present (hidden for unsplit area rows like Miami).
 */
export function cityPlaceParentLabel(
  place: {
    code?: string
    name: string
    nameEn?: string
    namePt?: string
    area?: string
    areaEn?: string
    areaPt?: string
  },
  lang: Lang,
  opts?: { domestic?: boolean },
): string {
  if (opts?.domestic) {
    const fromArea = brazilUfAbbrev({
      code: place.area,
      name: place.area || '',
    })
    if (fromArea) return fromArea
    const fromCode = (place.code || '').trim().toUpperCase().match(/^([A-Z]{2})-/)
    if (fromCode) return fromCode[1]
    return ''
  }
  if (!place.area && !place.areaEn && !place.areaPt) return ''
  // Unsplit overseas area row (Miami with area MIAMI): no distinct parent.
  if (
    place.area &&
    place.name &&
    place.area.toUpperCase() === place.name.toUpperCase()
  ) {
    return ''
  }
  return areaDisplayName(
    {
      code: place.area,
      name: place.area || '',
      nameEn: place.areaEn,
      namePt: place.areaPt,
    },
    lang,
  )
}

/** Leading UF code from a Bairro parent label ("AC · Acrelândia · Zona 008"). */
export function placeParentUf(
  place: { code?: string; area?: string; areaEn?: string; areaPt?: string },
): string | null {
  const fromCode = (place.code || '').trim().toUpperCase().match(/^([A-Z]{2})-/)
  if (fromCode) return fromCode[1]
  for (const raw of [place.area, place.areaEn, place.areaPt]) {
    if (!raw) continue
    const m = raw.trim().match(/^([A-Za-z]{2})\b/)
    if (m) return m[1].toUpperCase()
  }
  return null
}

/**
 * Compact parent for narrow screens: `SP · Zona 372` instead of
 * `SP · São Paulo · Zona 372` — drops the city so the place column can stay
 * dense (full string remains on the name tooltip).
 */
export function placeParentLabelCompact(
  place: { area?: string; areaEn?: string; areaPt?: string },
  lang: Lang,
): string {
  const full = placeParentLabel(place, lang)
  const m = full.match(
    /^([A-Za-z]{2})\s*·\s*.+?\s*·\s*((?:Zona|Zone)\s*\d+)\s*$/i,
  )
  if (m) return `${m[1].toUpperCase()} · ${m[2]}`
  return full
}

function isReported(c: VoteLike): boolean {
  if (c.status === 'pending') return false
  if (c.status === 'reported') return !!c.y2026
  return !!c.y2026
}

/** Lula change = 2026% − 2022%. */
export function lulaChange(c: VoteLike): number | null {
  if (c.swing != null) return c.swing.lulaPp
  if (!isReported(c) || !c.y2026 || !c.y2022) return null
  return c.y2026.lulaPct - c.y2022.lulaPct
}

/** Bolsonaro change = 2026% − 2022%. */
export function bolsonaroChange(c: VoteLike): number | null {
  if (c.swing != null) return c.swing.bolsonaroPp
  if (!isReported(c) || !c.y2026 || !c.y2022) return null
  return c.y2026.bolsonaroPct - c.y2022.bolsonaroPct
}

/** Swing to Lula = Lula change − Bolsonaro change. */
export function swingToLula(c: VoteLike): number | null {
  if (c.swing != null) return c.swing.lulaPp - c.swing.bolsonaroPp
  const l = lulaChange(c)
  const b = bolsonaroChange(c)
  if (l == null || b == null) return null
  return l - b
}

/** Swing to Bolsonaro = Bolsonaro change − Lula change. */
export function swingToBolsonaro(c: VoteLike): number | null {
  if (c.swing != null) return c.swing.bolsonaroPp - c.swing.lulaPp
  const l = lulaChange(c)
  const b = bolsonaroChange(c)
  if (l == null || b == null) return null
  return b - l
}

export function metricValue(c: VoteLike, metric: MapMetric): number | null {
  switch (metric) {
    case 'leader2026': {
      if (!isReported(c) || !c.y2026) return null
      const { lulaPct, bolsonaroPct } = c.y2026
      if (lulaPct > bolsonaroPct) return lulaPct
      if (bolsonaroPct > lulaPct) return -bolsonaroPct
      return 0
    }
    case 'leader2022': {
      if (!c.y2022) return null
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
    case 'swingToBolsonaro':
      return swingToBolsonaro(c)
    case 'lulaPct2026':
      return isReported(c) && c.y2026 ? c.y2026.lulaPct : null
    case 'bolsonaroPct2026':
      return isReported(c) && c.y2026 ? c.y2026.bolsonaroPct : null
    case 'lulaPct2022':
      return c.y2022?.lulaPct ?? null
    case 'bolsonaroPct2022':
      return c.y2022?.bolsonaroPct ?? null
    case 'otherPct2026':
      return isReported(c) && c.y2026 ? otherPct(c.y2026) : null
    case 'otherPct2022':
      return otherPct(c.y2022)
    case 'abstentionPct2026':
      return isReported(c) && c.y2026 ? abstentionPct(c.y2026) : null
    case 'abstentionPct2022':
      return abstentionPct(c.y2022)
    case 'votes2026':
      return isReported(c) && c.y2026 ? c.y2026.totalValid : null
    case 'votes2022':
      return c.y2022?.totalValid ?? null
    case 'lulaVotes2026':
      return isReported(c) && c.y2026 ? c.y2026.lula : null
    case 'lulaVotes2022':
      return c.y2022?.lula ?? null
    case 'bolsonaroVotes2026':
      return isReported(c) && c.y2026 ? c.y2026.bolsonaro : null
    case 'bolsonaroVotes2022':
      return c.y2022?.bolsonaro ?? null
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
    case 'swingToBolsonaro':
      return fmtPp(value, lang)
    case 'lulaPct2026':
    case 'bolsonaroPct2026':
    case 'lulaPct2022':
    case 'bolsonaroPct2022':
    case 'otherPct2026':
    case 'otherPct2022':
    case 'abstentionPct2026':
    case 'abstentionPct2022':
      return fmtPct(value, lang)
    case 'votes2026':
    case 'votes2022':
    case 'lulaVotes2026':
    case 'lulaVotes2022':
    case 'bolsonaroVotes2026':
    case 'bolsonaroVotes2022':
      return fmtInt(value, lang)
  }
}

export function runningTotals(countries: CountryResult[]) {
  let lula = 0
  let bolsonaro = 0
  let valid = 0
  let reported = 0
  for (const c of countries) {
    // Keep the header total overseas-only; domestic Brazil dwarfs ZZ.
    if (c.domestic) continue
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
  other2026: number | null
  otherPct2026: number | null
  other2022: number
  otherPct2022: number
  registered2026: number | null
  abstentions2026: number | null
  abstentionPct2026: number | null
  registered2022: number | null
  abstentions2022: number | null
  abstentionPct2022: number | null
  lula2022: number
  bolso2022: number
  valid2022: number
  lulaPct2022: number
  bolsoPct2022: number
  lulaChange: number | null
  bolsonaroChange: number | null
  swingToLula: number | null
  swingToBolsonaro: number | null
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
  let registered2026 = 0
  let abstentions2026 = 0
  let hasAbstention2026 = false
  let registered2022 = 0
  let abstentions2022 = 0
  let hasAbstention2022 = false
  let sectionsCounted = 0
  let sectionsTotal = 0
  let hasSections = false

  for (const c of rows) {
    lula2022 += c.y2022.lula
    bolso2022 += c.y2022.bolsonaro
    valid2022 += c.y2022.totalValid
    if (c.y2022.registered != null && c.y2022.abstentions != null) {
      hasAbstention2022 = true
      registered2022 += c.y2022.registered
      abstentions2022 += c.y2022.abstentions
    }
    if (c.status === 'reported' && c.y2026) {
      has2026 = true
      lula2026 += c.y2026.lula
      bolso2026 += c.y2026.bolsonaro
      valid2026 += c.y2026.totalValid
      lula2022Comparable += c.y2022.lula
      bolso2022Comparable += c.y2022.bolsonaro
      valid2022Comparable += c.y2022.totalValid
      if (c.y2026.registered != null && c.y2026.abstentions != null) {
        hasAbstention2026 = true
        registered2026 += c.y2026.registered
        abstentions2026 += c.y2026.abstentions
      }
    }
    if (c.coverage) {
      hasSections = true
      sectionsCounted += c.coverage.counted
      sectionsTotal += c.coverage.total
    }
  }

  const other2022 = Math.max(0, valid2022 - lula2022 - bolso2022)
  const other2026 = has2026 ? Math.max(0, valid2026 - lula2026 - bolso2026) : null
  const lulaPct2022 = valid2022 ? (lula2022 / valid2022) * 100 : 0
  const bolsoPct2022 = valid2022 ? (bolso2022 / valid2022) * 100 : 0
  const otherPct2022 = valid2022 ? (other2022 / valid2022) * 100 : 0
  const lulaPct2026 = has2026 && valid2026 ? (lula2026 / valid2026) * 100 : null
  const bolsoPct2026 = has2026 && valid2026 ? (bolso2026 / valid2026) * 100 : null
  const otherPct2026 =
    other2026 != null && valid2026 ? (other2026 / valid2026) * 100 : null
  const abstentionPct2026 =
    hasAbstention2026 && registered2026 > 0
      ? (abstentions2026 / registered2026) * 100
      : null
  const abstentionPct2022 =
    hasAbstention2022 && registered2022 > 0
      ? (abstentions2022 / registered2022) * 100
      : null
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
  const swingToBolsonaro =
    lulaChange != null && bolsonaroChange != null
      ? bolsonaroChange - lulaChange
      : null

  return {
    countries: rows.length,
    lula2026: has2026 ? lula2026 : null,
    bolso2026: has2026 ? bolso2026 : null,
    valid2026: has2026 ? valid2026 : null,
    lulaPct2026,
    bolsoPct2026,
    other2026,
    otherPct2026,
    other2022,
    otherPct2022,
    registered2026: hasAbstention2026 ? registered2026 : null,
    abstentions2026: hasAbstention2026 ? abstentions2026 : null,
    abstentionPct2026,
    registered2022: hasAbstention2022 ? registered2022 : null,
    abstentions2022: hasAbstention2022 ? abstentions2022 : null,
    abstentionPct2022,
    lula2022,
    bolso2022,
    valid2022,
    lulaPct2022,
    bolsoPct2022,
    lulaChange,
    bolsonaroChange,
    swingToLula,
    swingToBolsonaro,
    lulaVotesDelta: has2026 ? lula2026 - lula2022Comparable : null,
    bolsonaroVotesDelta: has2026 ? bolso2026 - bolso2022Comparable : null,
    sectionsCounted: hasSections ? sectionsCounted : null,
    sectionsTotal: hasSections ? sectionsTotal : null,
  }
}
