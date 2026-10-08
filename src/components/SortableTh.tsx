import type { PointerEvent as ReactPointerEvent } from 'react'

type Props = {
  children: React.ReactNode
  hint?: string
  onClick?: () => void
  align?: 'left' | 'right'
  heated?: boolean
  stickyCol?: 'rank' | 'country' | 'city'
  className?: string
  /** When set, header is a column-reorder drop/drag target. */
  'data-col-id'?: string
  draggable?: boolean
  onPointerDown?: (e: ReactPointerEvent<HTMLTableCellElement>) => void
  onPointerMove?: (e: ReactPointerEvent<HTMLTableCellElement>) => void
  onPointerUp?: (e: ReactPointerEvent<HTMLTableCellElement>) => void
  onPointerCancel?: (e: ReactPointerEvent<HTMLTableCellElement>) => void
  onClickCapture?: (e: React.MouseEvent<HTMLTableCellElement>) => void
}

/** Shared results-table header cell (country + city tables). */
export function SortableTh({
  children,
  hint,
  onClick,
  align = 'left',
  heated,
  stickyCol,
  className = '',
  'data-col-id': dataColId,
  draggable,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onClickCapture,
}: Props) {
  const stickyClass =
    stickyCol === 'rank'
      ? 'sticky-col sticky-col-rank'
      : stickyCol === 'country'
        ? 'sticky-col sticky-col-country'
        : stickyCol === 'city'
          ? 'sticky-col sticky-col-city'
          : ''
  const reorderable = Boolean(dataColId)
  return (
    <th
      className={`sticky-th px-2 py-2.5 font-medium ${stickyClass} ${align === 'right' ? 'text-right' : 'text-left'} ${
        onClick ? 'cursor-pointer select-none hover:text-[var(--ink)]' : ''
      } ${reorderable ? 'col-draggable' : ''} ${heated ? 'text-[var(--ink)] underline decoration-[var(--accent)] underline-offset-4' : ''} ${className}`}
      onClick={onClick}
      draggable={draggable}
      data-col-id={dataColId}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClickCapture={onClickCapture}
    >
      <span className="block whitespace-nowrap normal-case tracking-normal">
        <span className="flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide">
          {reorderable ? (
            <span
              className="col-drag-handle select-none text-[var(--ink-muted)]"
              aria-hidden
            >
              ⋮⋮
            </span>
          ) : null}
          <span
            className={`th-title ${align === 'right' ? 'ml-auto' : ''}`}
            title={typeof children === 'string' ? children : undefined}
          >
            {children}
          </span>
        </span>
        {hint ? (
          <span className="th-hint mt-0.5 block whitespace-nowrap text-[10px] font-normal normal-case tracking-normal text-[var(--ink-muted)] opacity-90">
            {hint}
          </span>
        ) : null}
      </span>
    </th>
  )
}
