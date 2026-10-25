import {
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import {
  ALL_TABLE_METRIC_COLS,
  TABLE_METRIC_COL_LABEL,
  type TableMetricCol,
} from '../lib/tableColumns'
import { useColumnDrag } from '../lib/useColumnDrag'
import { t } from '../lib/i18n'
import { COUNTRY_FLAG_ONLY_MQ, useMediaQuery } from '../lib/useMediaQuery'
import type { Lang } from '../types'

type Props = {
  lang: Lang
  visible: TableMetricCol[]
  columnOrder: TableMetricCol[]
  onChange: (next: TableMetricCol[]) => void
  onReorder: (from: TableMetricCol, to: TableMetricCol) => void
}

/** Shared metric visibility + order control for country/area/city tables. */
export function TableColumnPicker({
  lang,
  visible,
  columnOrder,
  onChange,
  onReorder,
}: Props) {
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const isNarrow = useMediaQuery(COUNTRY_FLAG_ONLY_MQ)
  const visibleSet = new Set(visible)
  // Handle-only drag so list scroll / checkbox taps are not stolen on touch.
  const { dragProps } = useColumnDrag(onReorder, { handleOnly: true })

  const toggle = (col: TableMetricCol) => {
    if (visibleSet.has(col)) {
      if (visible.length <= 1) return
      onChange(visible.filter((c) => c !== col))
      return
    }
    onChange(columnOrder.filter((c) => visibleSet.has(c) || c === col))
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (!open || isNarrow) return
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open, isNarrow])

  // Bottom sheet sits outside the sticky chrome — lock page scroll while open.
  useEffect(() => {
    if (!open || !isNarrow) return
    const html = document.documentElement
    const body = document.body
    const prevHtml = html.style.overflow
    const prevBody = body.style.overflow
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    return () => {
      html.style.overflow = prevHtml
      body.style.overflow = prevBody
    }
  }, [open, isNarrow])

  const list = (
    <ul className="table-col-picker-list">
      {columnOrder.map((col) => {
        const checked = visibleSet.has(col)
        const id = `${menuId}-${col}`
        return (
          <li key={col} className="col-draggable rounded-sm" {...dragProps(col)}>
            <label
              htmlFor={id}
              className="table-col-picker-option flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1.5 text-sm hover:bg-[var(--chip-soft)]"
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
              <span className="table-col-picker-label flex-1">
                {t(TABLE_METRIC_COL_LABEL[col], lang)}
              </span>
            </label>
          </li>
        )
      })}
    </ul>
  )

  const desktopMenu = open && !isNarrow ? (
    <div
      id={menuId}
      className="table-col-picker-menu absolute right-0 z-40 mt-1 rounded-md border border-[var(--line)] bg-[var(--paper)] p-2 shadow-lg"
      role="group"
      aria-label={t('tableColumns', lang)}
    >
      <p className="mb-2 px-1 text-[10px] leading-snug text-[var(--ink-muted)]">
        {t('tableColumnsHint', lang)}
      </p>
      {list}
    </div>
  ) : null

  const mobileSheet =
    open && isNarrow
      ? createPortal(
          <div className="table-col-picker-portal" role="presentation">
            <button
              type="button"
              className="table-col-picker-backdrop"
              aria-label={t('tableColumnsClose', lang)}
              onClick={() => setOpen(false)}
            />
            <div
              id={menuId}
              className="table-col-picker-sheet"
              role="dialog"
              aria-modal="true"
              aria-label={t('tableColumns', lang)}
            >
              <div className="table-col-picker-sheet-head">
                <div className="min-w-0">
                  <p className="table-col-picker-sheet-title">
                    {t('tableColumns', lang)}
                    <span className="ml-1.5 font-normal text-[var(--ink-muted)]">
                      ({visible.length}/{ALL_TABLE_METRIC_COLS.length})
                    </span>
                  </p>
                  <p className="table-col-picker-sheet-hint">
                    {t('tableColumnsHint', lang)}
                  </p>
                </div>
                <button
                  type="button"
                  className="control table-col-picker-done text-sm font-semibold"
                  onClick={() => setOpen(false)}
                >
                  {t('tableColumnsDone', lang)}
                </button>
              </div>
              <div className="table-col-picker-sheet-body">{list}</div>
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <div className="table-col-picker relative" ref={rootRef}>
      <button
        type="button"
        className="control cursor-pointer text-sm font-semibold"
        aria-haspopup={isNarrow ? 'dialog' : 'true'}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        {t('tableColumns', lang)}
        <span className="ml-1.5 font-normal text-[var(--ink-muted)]">
          ({visible.length}/{ALL_TABLE_METRIC_COLS.length})
        </span>
      </button>
      {desktopMenu}
      {mobileSheet}
    </div>
  )
}
