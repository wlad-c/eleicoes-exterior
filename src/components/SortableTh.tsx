type Props = {
  children: React.ReactNode
  hint?: string
  onClick?: () => void
  align?: 'left' | 'right'
  heated?: boolean
  stickyCol?: 'rank' | 'country' | 'city'
  draggable?: boolean
  onDragStart?: (e: React.DragEvent<HTMLTableCellElement>) => void
  onDragEnd?: (e: React.DragEvent<HTMLTableCellElement>) => void
  onDragOver?: (e: React.DragEvent<HTMLTableCellElement>) => void
  onDragLeave?: (e: React.DragEvent<HTMLTableCellElement>) => void
  onDrop?: (e: React.DragEvent<HTMLTableCellElement>) => void
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
  draggable,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
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
  return (
    <th
      className={`sticky-th px-2 py-2.5 font-medium ${stickyClass} ${align === 'right' ? 'text-right' : 'text-left'} ${
        onClick ? 'cursor-pointer select-none hover:text-[var(--ink)]' : ''
      } ${draggable ? 'col-draggable' : ''} ${heated ? 'text-[var(--ink)] underline decoration-[var(--accent)] underline-offset-4' : ''}`}
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClickCapture={onClickCapture}
    >
      <span className="block whitespace-nowrap normal-case tracking-normal">
        <span className="block whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide">
          {children}
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
