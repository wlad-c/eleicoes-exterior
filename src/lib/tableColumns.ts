import type { DictKey } from './i18n'

/** Columns users can show/hide (shared by country + area/city tables). */
export type TableMetricCol =
  | 'region'
  | 'votes2026'
  | 'lulaPct2026'
  | 'bolsonaroPct2026'
  | 'lulaPct2022'
  | 'bolsonaroPct2022'
  | 'lulaChange'
  | 'bolsonaroChange'
  | 'swingToLula'
  | 'sections'

export const ALL_TABLE_METRIC_COLS: TableMetricCol[] = [
  'region',
  'votes2026',
  'lulaPct2026',
  'bolsonaroPct2026',
  'lulaPct2022',
  'bolsonaroPct2022',
  'lulaChange',
  'bolsonaroChange',
  'swingToLula',
  'sections',
]

/** Default: hide region, 2022 share columns, and sections. */
export const DEFAULT_TABLE_METRIC_COLS: TableMetricCol[] = [
  'votes2026',
  'lulaPct2026',
  'bolsonaroPct2026',
  'lulaChange',
  'bolsonaroChange',
  'swingToLula',
]

export const TABLE_METRIC_COL_LABEL: Record<TableMetricCol, DictKey> = {
  region: 'region',
  votes2026: 'votes2026',
  lulaPct2026: 'colLula2026',
  bolsonaroPct2026: 'colFBolsonaro2026',
  lulaPct2022: 'colLula2022',
  bolsonaroPct2022: 'colJBolsonaro2022',
  lulaChange: 'lulaChange',
  bolsonaroChange: 'bolsonaroChange',
  swingToLula: 'swingToLula',
  sections: 'notes',
}

/** Bump when default visibility changes so stored prefs reset. */
export const TABLE_COLS_STORAGE_KEY = 'eleicoes-exterior-table-cols-v2'

export function isTableMetricCol(v: string): v is TableMetricCol {
  return (ALL_TABLE_METRIC_COLS as string[]).includes(v)
}

export function readStoredTableCols(): TableMetricCol[] {
  try {
    const raw = localStorage.getItem(TABLE_COLS_STORAGE_KEY)
    if (!raw) return DEFAULT_TABLE_METRIC_COLS
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return DEFAULT_TABLE_METRIC_COLS
    const cols = parsed.filter(
      (c): c is TableMetricCol => typeof c === 'string' && isTableMetricCol(c),
    )
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
