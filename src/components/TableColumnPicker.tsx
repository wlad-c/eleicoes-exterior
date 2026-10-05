import {
  ALL_TABLE_METRIC_COLS,
  TABLE_METRIC_COL_LABEL,
  type TableMetricCol,
} from '../lib/tableColumns'
import { useColumnDrag } from '../lib/useColumnDrag'
import { t } from '../lib/i18n'
import type { Lang } from '../types'

type Props = {
  lang: Lang
  visible: TableMetricCol[]
  columnOrder: TableMetricCol[]
  onChange: (next: TableMetricCol[]) => void
  onReorder: (from: TableMetricCol, to: TableMetricCol) => void
}

/** Shared column visibility + order control for country/area/city tables. */
export function TableColumnPicker({
  lang,
  visible,
  columnOrder,
  onChange,
  onReorder,
}: Props) {
  const visibleSet = new Set(visible)
  const { dragProps } = useColumnDrag(onReorder)

  const toggle = (col: TableMetricCol) => {
    if (visibleSet.has(col)) {
      if (visible.length <= 1) return
      onChange(visible.filter((c) => c !== col))
      return
    }
    onChange(columnOrder.filter((c) => visibleSet.has(c) || c === col))
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
          {columnOrder.map((col) => {
            const checked = visibleSet.has(col)
            const id = `table-col-${col}`
            return (
              <li key={col} className="col-draggable rounded-sm" {...dragProps(col)}>
                <label
                  htmlFor={id}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 text-sm hover:bg-[var(--chip-soft)]"
                >
                  <span
                    className="col-drag-handle select-none text-[var(--ink-muted)]"
                    aria-hidden
                    title={t('tableColumnsDrag', lang)}
                  >
                    ⋮⋮
                  </span>
                  <input
                    id={id}
                    type="checkbox"
                    checked={checked}
                    disabled={checked && visible.length <= 1}
                    onChange={() => toggle(col)}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
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
