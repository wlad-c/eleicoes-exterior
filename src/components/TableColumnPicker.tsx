import {
  ALL_TABLE_METRIC_COLS,
  TABLE_METRIC_COL_LABEL,
  type TableMetricCol,
} from '../lib/tableColumns'
import { t } from '../lib/i18n'
import type { Lang } from '../types'

type Props = {
  lang: Lang
  visible: TableMetricCol[]
  onChange: (next: TableMetricCol[]) => void
}

/** Shared column visibility control for country + city tables. */
export function TableColumnPicker({ lang, visible, onChange }: Props) {
  const visibleSet = new Set(visible)

  const toggle = (col: TableMetricCol) => {
    if (visibleSet.has(col)) {
      if (visible.length <= 1) return
      onChange(visible.filter((c) => c !== col))
      return
    }
    onChange(ALL_TABLE_METRIC_COLS.filter((c) => visibleSet.has(c) || c === col))
  }

  return (
    <details className="table-col-picker relative">
      <summary className="control cursor-pointer list-none text-sm font-semibold">
        {t('tableColumns', lang)}
        <span className="ml-1.5 font-normal text-[var(--ink-muted)]">
          ({visible.length}/{ALL_TABLE_METRIC_COLS.length})
        </span>
      </summary>
      <div className="table-col-picker-menu absolute right-0 z-40 mt-1 min-w-[14rem] rounded-md border border-[var(--line)] bg-[var(--paper)] p-2 shadow-lg">
        <p className="mb-2 px-1 text-[10px] leading-snug text-[var(--ink-muted)]">
          {t('tableColumnsHint', lang)}
        </p>
        <ul className="space-y-0.5">
          {ALL_TABLE_METRIC_COLS.map((col) => {
            const checked = visibleSet.has(col)
            const id = `table-col-${col}`
            return (
              <li key={col}>
                <label
                  htmlFor={id}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 text-sm hover:bg-[var(--chip-soft)]"
                >
                  <input
                    id={id}
                    type="checkbox"
                    checked={checked}
                    disabled={checked && visible.length <= 1}
                    onChange={() => toggle(col)}
                  />
                  <span>{t(TABLE_METRIC_COL_LABEL[col], lang)}</span>
                </label>
              </li>
            )
          })}
        </ul>
      </div>
    </details>
  )
}
