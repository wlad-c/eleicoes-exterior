import type { DictKey } from './i18n'

/** Columns users can show/hide/reorder (shared by country + area/city tables). */
export type TableMetricCol =
  | 'region'
  | 'votes2026'
  | 'votes2022'
  | 'votes2026R1'
  | 'votes2022R1'
  | 'lulaPct2026'
  | 'bolsonaroPct2026'
  | 'lulaPct2022'
  | 'bolsonaroPct2022'
  | 'lulaPct2026R1'
  | 'bolsonaroPct2026R1'
  | 'lulaPct2022R1'
  | 'bolsonaroPct2022R1'
  | 'difference2026'
  | 'difference2022'
  | 'difference2026R1'
  | 'difference2022R1'
  | 'otherPct2026'
  | 'otherPct2022'
  | 'noValidVotePct2026'
  | 'noValidVotePct2022'
  | 'noValidVotes2026'
  | 'noValidVotes2022'
  | 'lulaChange'
  | 'bolsonaroChange'
  | 'swing'
  | 'lulaRoundShift'
  | 'bolsonaroRoundShift'
  | 'roundSwing'
  | 'lulaRoundShift2022'
  | 'bolsonaroRoundShift2022'
  | 'roundSwing2022'
  | 'sections'

/**
 * Wide-screen default order (1º votes/% → 2º votes/% → Δ → swing).
 * Remaining metrics follow for the column picker.
 */
export const ALL_TABLE_METRIC_COLS: TableMetricCol[] = [
  'votes2026R1',
  'lulaPct2026R1',
  'bolsonaroPct2026R1',
  'votes2026',
  'lulaPct2026',
  'bolsonaroPct2026',
  'lulaRoundShift',
  'bolsonaroRoundShift',
  'roundSwing',
  'region',
  'difference2026',
  'difference2026R1',
  'votes2022',
  'lulaPct2022',
  'bolsonaroPct2022',
  'votes2022R1',
  'lulaPct2022R1',
  'bolsonaroPct2022R1',
  'difference2022',
  'difference2022R1',
  'lulaRoundShift2022',
  'bolsonaroRoundShift2022',
  'roundSwing2022',
  'lulaChange',
  'bolsonaroChange',
  'swing',
  'otherPct2026',
  'otherPct2022',
  'noValidVotePct2026',
  'noValidVotePct2022',
  'noValidVotes2026',
  'noValidVotes2022',
  'sections',
]

/** Match country-name no-truncate; enough room for the 9-column default. */
export const TABLE_WIDE_DEFAULTS_MQ = '(min-width: 1100px)'

/**
 * Large screens: 2026 1º votes/%, 2026 2º votes/%, round change, round swing.
 */
export const DEFAULT_TABLE_METRIC_COLS_WIDE: TableMetricCol[] = [
  'votes2026R1',
  'lulaPct2026R1',
  'bolsonaroPct2026R1',
  'votes2026',
  'lulaPct2026',
  'bolsonaroPct2026',
  'lulaRoundShift',
  'bolsonaroRoundShift',
  'roundSwing',
]

/**
 * Narrow screens: 2026 runoff votes/% + change vs 1st round + round swing.
 */
export const DEFAULT_TABLE_METRIC_COLS_NARROW: TableMetricCol[] = [
  'votes2026',
  'lulaPct2026',
  'bolsonaroPct2026',
  'lulaRoundShift',
  'bolsonaroRoundShift',
  'roundSwing',
]

/** @deprecated Prefer defaultTableMetricCols() — kept for call-site clarity. */
export const DEFAULT_TABLE_METRIC_COLS = DEFAULT_TABLE_METRIC_COLS_WIDE

export function isWideTableViewport(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true
  return window.matchMedia(TABLE_WIDE_DEFAULTS_MQ).matches
}

export function defaultTableMetricCols(
  wide = isWideTableViewport(),
): TableMetricCol[] {
  return wide
    ? [...DEFAULT_TABLE_METRIC_COLS_WIDE]
    : [...DEFAULT_TABLE_METRIC_COLS_NARROW]
}

/** 2026 1º columns — de-emphasized vs runoff in the default wide layout. */
export const PRIOR_ROUND_TABLE_COLS: ReadonlySet<TableMetricCol> = new Set([
  'votes2026R1',
  'lulaPct2026R1',
  'bolsonaroPct2026R1',
])

export function isPriorRoundTableCol(col: TableMetricCol): boolean {
  return PRIOR_ROUND_TABLE_COLS.has(col)
}

export const TABLE_METRIC_COL_LABEL: Record<TableMetricCol, DictKey> = {
  region: 'region',
  votes2026: 'votes2026',
  votes2022: 'votes2022',
  votes2026R1: 'votes2026R1',
  votes2022R1: 'votes2022R1',
  lulaPct2026: 'lulaPct2026',
  bolsonaroPct2026: 'bolsonaroPct2026',
  lulaPct2022: 'lulaPct2022',
  bolsonaroPct2022: 'bolsonaroPct2022',
  lulaPct2026R1: 'lulaPct2026R1',
  bolsonaroPct2026R1: 'bolsonaroPct2026R1',
  lulaPct2022R1: 'lulaPct2022R1',
  bolsonaroPct2022R1: 'bolsonaroPct2022R1',
  difference2026: 'difference2026',
  difference2022: 'difference2022',
  difference2026R1: 'difference2026R1',
  difference2022R1: 'difference2022R1',
  otherPct2026: 'otherPct2026',
  otherPct2022: 'otherPct2022',
  noValidVotePct2026: 'noValidVotePct2026',
  noValidVotePct2022: 'noValidVotePct2022',
  noValidVotes2026: 'noValidVotes2026',
  noValidVotes2022: 'noValidVotes2022',
  lulaChange: 'lulaChange',
  bolsonaroChange: 'bolsonaroChange',
  swing: 'swing',
  lulaRoundShift: 'lulaRoundShift',
  bolsonaroRoundShift: 'bolsonaroRoundShift',
  roundSwing: 'roundSwing',
  lulaRoundShift2022: 'lulaRoundShift2022',
  bolsonaroRoundShift2022: 'bolsonaroRoundShift2022',
  roundSwing2022: 'roundSwing2022',
  sections: 'notes',
}

/** Bump when default visibility / column ids change so stored prefs reset. */
export const TABLE_COLS_STORAGE_KEY = 'eleicoes-exterior-table-cols-v9'
export const TABLE_COL_ORDER_STORAGE_KEY = 'eleicoes-exterior-table-col-order-v6'

export function isTableMetricCol(v: string): v is TableMetricCol {
  return (ALL_TABLE_METRIC_COLS as string[]).includes(v)
}

/** Map legacy column ids onto the current set. */
function migrateLegacyCol(c: string): TableMetricCol | null {
  if (c === 'swingToLula' || c === 'swingToBolsonaro') return 'swing'
  if (c === 'abstentionPct2026') return 'noValidVotePct2026'
  if (c === 'abstentionPct2022') return 'noValidVotePct2022'
  if (c === 'abstentions2026') return 'noValidVotes2026'
  if (c === 'abstentions2022') return 'noValidVotes2022'
  if (isTableMetricCol(c)) return c
  return null
}

/** Normalize a partial/legacy order into a full permutation of all metric cols. */
export function normalizeColumnOrder(
  order: readonly string[] | null | undefined,
): TableMetricCol[] {
  const seen = new Set<TableMetricCol>()
  const next: TableMetricCol[] = []
  for (const c of order ?? []) {
    const col = migrateLegacyCol(c)
    if (col && !seen.has(col)) {
      seen.add(col)
      next.push(col)
    }
  }
  for (const c of ALL_TABLE_METRIC_COLS) {
    if (!seen.has(c)) next.push(c)
  }
  return next
}

export function orderedVisibleCols(
  order: readonly TableMetricCol[],
  visible: readonly TableMetricCol[],
): TableMetricCol[] {
  const vis = new Set(visible)
  return order.filter((c) => vis.has(c))
}

export function moveColumn(
  order: readonly TableMetricCol[],
  from: TableMetricCol,
  to: TableMetricCol,
): TableMetricCol[] {
  if (from === to) return [...order]
  const next = [...order]
  const fromIdx = next.indexOf(from)
  const toIdx = next.indexOf(to)
  if (fromIdx < 0 || toIdx < 0) return next
  next.splice(fromIdx, 1)
  next.splice(toIdx, 0, from)
  return next
}

export function readStoredTableCols(): TableMetricCol[] {
  const fallback = defaultTableMetricCols()
  try {
    const raw = localStorage.getItem(TABLE_COLS_STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return fallback
    const seen = new Set<TableMetricCol>()
    const cols: TableMetricCol[] = []
    for (const c of parsed) {
      if (typeof c !== 'string') continue
      const col = migrateLegacyCol(c)
      if (col && !seen.has(col)) {
        seen.add(col)
        cols.push(col)
      }
    }
    return cols.length > 0 ? cols : fallback
  } catch {
    return fallback
  }
}

export function writeStoredTableCols(cols: TableMetricCol[]) {
  try {
    localStorage.setItem(TABLE_COLS_STORAGE_KEY, JSON.stringify(cols))
  } catch {
    /* ignore */
  }
}

export function readStoredColumnOrder(): TableMetricCol[] {
  try {
    const raw = localStorage.getItem(TABLE_COL_ORDER_STORAGE_KEY)
    if (!raw) return [...ALL_TABLE_METRIC_COLS]
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return [...ALL_TABLE_METRIC_COLS]
    return normalizeColumnOrder(parsed)
  } catch {
    return [...ALL_TABLE_METRIC_COLS]
  }
}

export function writeStoredColumnOrder(order: TableMetricCol[]) {
  try {
    localStorage.setItem(
      TABLE_COL_ORDER_STORAGE_KEY,
      JSON.stringify(normalizeColumnOrder(order)),
    )
  } catch {
    /* ignore */
  }
}
