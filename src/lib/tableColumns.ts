import type { DictKey } from './i18n'

/** Columns users can show/hide/reorder (shared by country + area/city tables). */
export type TableMetricCol =
  | 'region'
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
  | 'abstentionPct2026'
  | 'abstentionPct2022'
  | 'abstentions2026'
  | 'abstentions2022'
  | 'lulaChange'
  | 'bolsonaroChange'
  | 'swing'
  | 'sections'

export const ALL_TABLE_METRIC_COLS: TableMetricCol[] = [
  'region',
  'votes2026',
  'votes2022',
  'lulaPct2026',
  'bolsonaroPct2026',
  'lulaPct2022',
  'bolsonaroPct2022',
  'difference2026',
  'difference2022',
  'otherPct2026',
  'otherPct2022',
  'abstentionPct2026',
  'abstentionPct2022',
  'abstentions2026',
  'abstentions2022',
  'lulaChange',
  'bolsonaroChange',
  'swing',
  'sections',
]

/**
 * Default: hide region, 2022 vote/share/difference columns, other/abstention
 * shares and volumes, and sections.
 */
export const DEFAULT_TABLE_METRIC_COLS: TableMetricCol[] = [
  'votes2026',
  'lulaPct2026',
  'bolsonaroPct2026',
  'difference2026',
  'lulaChange',
  'bolsonaroChange',
  'swing',
]

export const TABLE_METRIC_COL_LABEL: Record<TableMetricCol, DictKey> = {
  region: 'region',
  votes2026: 'votes2026',
  votes2022: 'votes2022',
  lulaPct2026: 'colLula2026',
  bolsonaroPct2026: 'colFBolsonaro2026',
  lulaPct2022: 'colLula2022',
  bolsonaroPct2022: 'colJBolsonaro2022',
  difference2026: 'colDifference2026',
  difference2022: 'colDifference2022',
  otherPct2026: 'otherPct2026',
  otherPct2022: 'otherPct2022',
  abstentionPct2026: 'abstentionPct2026',
  abstentionPct2022: 'abstentionPct2022',
  abstentions2026: 'abstentions2026',
  abstentions2022: 'abstentions2022',
  lulaChange: 'lulaChange',
  bolsonaroChange: 'bolsonaroChange',
  swing: 'colSwing',
  sections: 'notes',
}

/** Bump when default visibility changes so stored prefs reset. */
export const TABLE_COLS_STORAGE_KEY = 'eleicoes-exterior-table-cols-v5'
export const TABLE_COL_ORDER_STORAGE_KEY = 'eleicoes-exterior-table-col-order-v2'

export function isTableMetricCol(v: string): v is TableMetricCol {
  return (ALL_TABLE_METRIC_COLS as string[]).includes(v)
}

/** Map legacy column ids onto the current set. */
function migrateLegacyCol(c: string): TableMetricCol | null {
  if (c === 'swingToLula' || c === 'swingToBolsonaro') return 'swing'
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
  try {
    const raw = localStorage.getItem(TABLE_COLS_STORAGE_KEY)
    if (!raw) return DEFAULT_TABLE_METRIC_COLS
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return DEFAULT_TABLE_METRIC_COLS
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
    return cols.length > 0 ? cols : DEFAULT_TABLE_METRIC_COLS
  } catch {
    return DEFAULT_TABLE_METRIC_COLS
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
