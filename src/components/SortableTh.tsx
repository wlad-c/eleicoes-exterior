type Props = {
  children: React.ReactNode
  hint?: string
  onClick?: () => void
  align?: 'left' | 'right'
  heated?: boolean
  stickyCol?: 'rank' | 'country'
}

/** Shared results-table header cell (country + city tables). */
export function SortableTh({
  children,
  hint,
  onClick,
  align = 'left',
  heated,
  stickyCol,
}: Props) {
  const stickyClass =
    stickyCol === 'rank'
      ? 'sticky-col sticky-col-rank'
      : stickyCol === 'country'
        ? 'sticky-col sticky-col-country'
        : ''
  return (
    <th
      className={`sticky-th px-2 py-2.5 font-medium ${stickyClass} ${align === 'right' ? 'text-right' : 'text-left'} ${
        onClick ? 'cursor-pointer select-none hover:text-[var(--ink)]' : ''
      } ${heated ? 'text-[var(--ink)] underline decoration-[var(--accent)] underline-offset-4' : ''}`}
      onClick={onClick}
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
