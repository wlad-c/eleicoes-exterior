import type { MapFocus } from './brazilGeo'
import type { ElectionRound } from './electionRound'
import {
  isTableMetricCol,
  normalizeColumnOrder,
  type TableMetricCol,
} from './tableColumns'
import type { Theme } from './theme'
import {
  HEATMAP_METRICS,
  type Lang,
  type MapMetric,
  type SortKey,
} from '../types'

export type TableView = 'countries' | 'areas' | 'cities' | 'suburbs'

const TABLE_VIEWS: TableView[] = ['countries', 'areas', 'cities', 'suburbs']

const SORT_KEYS: SortKey[] = [
  'votes2026',
  'votes2022',
  'votes2026R1',
  'votes2022R1',
  'lulaPct2026',
  'bolsonaroPct2026',
  'lulaPct2022',
  'bolsonaroPct2022',
  'lulaPct2026R1',
  'bolsonaroPct2026R1',
  'lulaPct2022R1',
  'bolsonaroPct2022R1',
  'difference2026',
  'difference2022',
  'difference2026R1',
  'difference2022R1',
  'otherPct2026',
  'otherPct2022',
  'noValidVotePct2026',
  'noValidVotePct2022',
  'noValidVotes2026',
  'noValidVotes2022',
  'lulaChange',
  'bolsonaroChange',
  'swing',
  'lulaRoundShift',
  'bolsonaroRoundShift',
  'roundSwing',
  'lulaRelativeGrowth',
  'bolsonaroRelativeGrowth',
  'lulaRoundShift2022',
  'bolsonaroRoundShift2022',
  'roundSwing2022',
  'lulaRelativeGrowth2022',
  'bolsonaroRelativeGrowth2022',
  'sections',
  'country',
  'region',
  'city',
]

/** Query keys written by the share button / read on load. */
export const SHARE_PARAM_KEYS = [
  'round',
  'lang',
  'theme',
  'q',
  'region',
  'status',
  'countries',
  'areas',
  'cities',
  'metric',
  'sort',
  'dir',
  'highlight',
  'focus',
  'brazil',
  'view',
  'cols',
  'order',
] as const

export type ShareViewState = {
  round: ElectionRound
  lang: Lang
  theme: Theme
  query: string
  region: string
  status: 'reported' | 'all' | 'pending'
  countries: string[]
  areas: string[]
  cities: string[]
  metric: MapMetric
  sortKey: SortKey
  sortDir: 'asc' | 'desc'
  highlightId: string | null
  mapFocus: MapFocus
  includeBrazil: boolean
  tableView: TableView
  visibleCols: TableMetricCol[]
  columnOrder: TableMetricCol[]
}

/** Fields present in the URL (partial restore). */
export type ParsedShareState = Partial<ShareViewState> & {
  /** True when at least one share view param was present. */
  active: boolean
}

function isMapMetric(v: string): v is MapMetric {
  return (HEATMAP_METRICS as string[]).includes(v)
}

function isSortKey(v: string): v is SortKey {
  return (SORT_KEYS as string[]).includes(v)
}

function isTableView(v: string): v is TableView {
  return (TABLE_VIEWS as string[]).includes(v)
}

function splitList(raw: string | null): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function parseCols(raw: string | null): TableMetricCol[] | undefined {
  if (raw == null || raw === '') return undefined
  const cols: TableMetricCol[] = []
  const seen = new Set<TableMetricCol>()
  for (const part of splitList(raw)) {
    if (isTableMetricCol(part) && !seen.has(part)) {
      seen.add(part)
      cols.push(part)
    }
  }
  return cols.length > 0 ? cols : undefined
}

function encodeFocus(focus: MapFocus): string | null {
  if (focus.level === 'world') return null
  if (focus.level === 'brazil') return 'brazil'
  if (focus.level === 'uf') return `uf:${focus.uf}`
  return `city:${focus.uf}:${focus.cityCode}`
}

function parseFocus(raw: string | null): MapFocus | undefined {
  if (raw == null || raw === '' || raw === 'world') return undefined
  if (raw === 'brazil') return { level: 'brazil' }
  if (raw.startsWith('uf:')) {
    const uf = raw.slice(3).trim().toUpperCase()
    if (!uf) return undefined
    return { level: 'uf', uf }
  }
  if (raw.startsWith('city:')) {
    const rest = raw.slice(5)
    const colon = rest.indexOf(':')
    if (colon <= 0) return undefined
    const uf = rest.slice(0, colon).trim().toUpperCase()
    const cityCode = rest.slice(colon + 1).trim()
    if (!uf || !cityCode) return undefined
    return { level: 'city', uf, cityCode }
  }
  return undefined
}

function hasShareKeys(params: URLSearchParams): boolean {
  return SHARE_PARAM_KEYS.some((k) => params.has(k))
}

/** Parse shareable view settings from a query string (`?...` or bare). */
export function parseShareSearch(
  search = typeof window !== 'undefined' ? window.location.search : '',
): ParsedShareState {
  const params = new URLSearchParams(
    search.startsWith('?') ? search.slice(1) : search,
  )
  if (!hasShareKeys(params)) return { active: false }

  const out: ParsedShareState = { active: true }

  const round = params.get('round')
  if (round === '1' || round === '2') out.round = round

  const lang = params.get('lang')
  if (lang === 'en' || lang === 'pt') out.lang = lang

  const theme = params.get('theme')
  if (theme === 'light' || theme === 'dark') out.theme = theme

  if (params.has('q')) out.query = params.get('q') ?? ''

  const region = params.get('region')
  if (region != null && region !== '') out.region = region

  const status = params.get('status')
  if (status === 'reported' || status === 'all' || status === 'pending') {
    out.status = status
  }

  if (params.has('countries')) out.countries = splitList(params.get('countries'))
  if (params.has('areas')) out.areas = splitList(params.get('areas'))
  if (params.has('cities')) out.cities = splitList(params.get('cities'))

  const metric = params.get('metric')
  if (metric && isMapMetric(metric)) out.metric = metric

  const sort = params.get('sort')
  if (sort && isSortKey(sort)) out.sortKey = sort

  const dir = params.get('dir')
  if (dir === 'asc' || dir === 'desc') out.sortDir = dir

  if (params.has('highlight')) {
    const h = params.get('highlight')
    out.highlightId = h && h.length > 0 ? h : null
  }

  const focus = parseFocus(params.get('focus'))
  if (focus) out.mapFocus = focus

  if (params.has('brazil')) {
    const b = params.get('brazil')
    out.includeBrazil = b === '1' || b === 'true' || b === 'yes'
  }

  const view = params.get('view')
  if (view && isTableView(view)) out.tableView = view

  const cols = parseCols(params.get('cols'))
  if (cols) out.visibleCols = cols

  const orderRaw = params.get('order')
  if (orderRaw != null && orderRaw !== '') {
    out.columnOrder = normalizeColumnOrder(splitList(orderRaw))
  }

  return out
}

/** Serialize a full view snapshot into query params (omits world-default focus). */
export function buildShareSearch(
  state: ShareViewState,
  existingSearch = typeof window !== 'undefined' ? window.location.search : '',
): string {
  const params = new URLSearchParams()

  // Preserve poll override when present.
  const existing = new URLSearchParams(
    existingSearch.startsWith('?') ? existingSearch.slice(1) : existingSearch,
  )
  const refreshMs = existing.get('refreshMs')
  if (refreshMs && /^\d+$/.test(refreshMs)) {
    params.set('refreshMs', refreshMs)
  }

  // Rounds are merged into one experience; keep `round=2` for older share links.
  params.set('round', '2')
  params.set('lang', state.lang)
  params.set('theme', state.theme)
  if (state.query) params.set('q', state.query)
  if (state.region && state.region !== 'all') params.set('region', state.region)
  params.set('status', state.status)
  if (state.countries.length) params.set('countries', state.countries.join(','))
  if (state.areas.length) params.set('areas', state.areas.join(','))
  if (state.cities.length) params.set('cities', state.cities.join(','))
  params.set('metric', state.metric)
  params.set('sort', state.sortKey)
  params.set('dir', state.sortDir)
  if (state.highlightId) params.set('highlight', state.highlightId)
  const focus = encodeFocus(state.mapFocus)
  if (focus) params.set('focus', focus)
  if (state.includeBrazil) params.set('brazil', '1')
  if (state.tableView !== 'countries') params.set('view', state.tableView)
  params.set('cols', state.visibleCols.join(','))
  params.set('order', state.columnOrder.join(','))

  return params.toString()
}

/** Absolute share URL for the current page origin + Vite base. */
export function buildShareUrl(
  state: ShareViewState,
  existingSearch = typeof window !== 'undefined' ? window.location.search : '',
): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const base = import.meta.env.BASE_URL || '/'
  const path = base.endsWith('/') ? base : `${base}/`
  const qs = buildShareSearch(state, existingSearch)
  return `${origin}${path}${qs ? `?${qs}` : ''}`
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
