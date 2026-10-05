import type { DictKey } from './i18n'

/** Metric columns users can show/hide (shared by country + city tables). */
export type TableMetricCol =
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

export const DEFAULT_TABLE_METRIC_COLS: TableMetricCol[] = [...ALL_TABLE_METRIC_COLS]

export const TABLE_METRIC_COL_LABEL: Record<TableMetricCol, DictKey> = {
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

export const TABLE_COLS_STORAGE_KEY = 'eleicoes-exterior-table-cols'

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
