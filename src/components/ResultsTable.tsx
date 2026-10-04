import { makeMetricColorizer, withAlpha } from '../lib/colors'
import { countryName, fmtInt, fmtPct, fmtPp, metricValue } from '../lib/format'
import { regionLabel, t } from '../lib/i18n'
import {
  heatColumnForMetric,
  type CountryResult,
  type HeatColumn,
  type Lang,
  type MapMetric,
  type SortKey,
} from '../types'

type Props = {
  rows: CountryResult[]
  allCountries: CountryResult[]
  lang: Lang
  sortKey: SortKey
  sortDir: 'asc' | 'desc'
  onSort: (key: SortKey) => void
  highlightId: string | null
  onSelect: (id: string) => void
  metric: MapMetric
}

export function ResultsTable({
  rows,
  allCountries,
  lang,
  sortKey,
  sortDir,
  onSort,
  highlightId,
  onSelect,
  metric,
}: Props) {
  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-[var(--ink-muted)]">{t('noMatch', lang)}</p>
    )
  }

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  const colorize = makeMetricColorizer(metric, allCountries)
  const heatCol = heatColumnForMetric(metric)

  return (
    <div className="table-scroll max-h-[min(70vh,52rem)] overflow-auto">
      <table className="w-full min-w-[920px] border-collapse text-left text-sm">
        <thead className="sticky top-0 z-20">
          <tr className="border-b border-[var(--line)] text-xs uppercase tracking-wide text-[var(--ink-muted)]">
            <Th onClick={() => onSort('country')}>
              {t('country', lang)}
              {arrow('country')}
            </Th>
            <Th onClick={() => onSort('region')}>
              {t('region', lang)}
              {arrow('region')}
            </Th>
            <Th
              onClick={() => onSort('votes2026')}
              align="right"
              heated={heatCol === 'lula2026'}
            >
              {t('lula', lang)} 2026{arrow('votes2026')}
            </Th>
            <Th align="right" heated={heatCol === 'bolso2026'}>
              {t('fBolsonaro', lang)} 2026
            </Th>
            <Th
              onClick={() => onSort('lulaPct2026')}
              align="right"
              heated={heatCol === 'lulaPct2026'}
            >
              Lula %{arrow('lulaPct2026')}
            </Th>
            <Th
              onClick={() => onSort('bolsonaroPct2026')}
              align="right"
              heated={heatCol === 'bolsoPct2026'}
            >
              F.B. %{arrow('bolsonaroPct2026')}
            </Th>
            <Th align="right" heated={heatCol === 'lula2022'}>
              {t('lula', lang)} 2022
            </Th>
            <Th align="right" heated={heatCol === 'bolso2022'}>
              {t('jBolsonaro', lang)} 2022
            </Th>
            <Th
              onClick={() => onSort('marginSwing')}
              align="right"
              heated={heatCol === 'marginSwing'}
            >
              {t('marginSwing', lang)}
              {arrow('marginSwing')}
            </Th>
            <th className="px-2 py-2 font-medium">{t('notes', lang)}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const hi = highlightId === c.id
            const value = metricValue(c, metric)
            const heat =
              value != null ? withAlpha(colorize(value), 0.28) : undefined
            return (
              <tr
                key={c.id}
                id={`row-${c.id}`}
                onClick={() => onSelect(c.id)}
                className={`cursor-pointer border-b border-[var(--line-soft)] transition-colors ${
                  hi ? 'bg-[var(--chip)]' : 'hover:bg-[var(--chip-soft)]'
                }`}
              >
                <td className="px-2 py-2.5 font-medium text-[var(--ink)]">
                  {countryName(c, lang)}
                </td>
                <td className="px-2 py-2.5 text-[var(--ink-muted)]">
                  {regionLabel(c.region, lang)}
                </td>
                <HeatTd col="lula2026" heatCol={heatCol} heat={heat}>
                  {fmtInt(c.y2026?.lula, lang)}
                </HeatTd>
                <HeatTd col="bolso2026" heatCol={heatCol} heat={heat}>
                  {fmtInt(c.y2026?.bolsonaro, lang)}
                </HeatTd>
                <HeatTd col="lulaPct2026" heatCol={heatCol} heat={heat}>
                  {fmtPct(c.y2026?.lulaPct, lang)}
                </HeatTd>
                <HeatTd col="bolsoPct2026" heatCol={heatCol} heat={heat}>
                  {fmtPct(c.y2026?.bolsonaroPct, lang)}
                </HeatTd>
                <HeatTd
                  col="lula2022"
                  heatCol={heatCol}
                  heat={heat}
                  muted
                >
                  {fmtInt(c.y2022.lula, lang)}
                </HeatTd>
                <HeatTd
                  col="bolso2022"
                  heatCol={heatCol}
                  heat={heat}
                  muted
                >
                  {fmtInt(c.y2022.bolsonaro, lang)}
                </HeatTd>
                <HeatTd
                  col="marginSwing"
                  heatCol={heatCol}
                  heat={heat}
                  strong
                >
                  {fmtPp(c.swing?.marginPp, lang)}
                </HeatTd>
                <td className="px-2 py-2.5 text-[var(--ink-muted)]">
                  {c.status === 'pending' ? t('pendingHint', lang) : c.notes || '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function HeatTd({
  col,
  heatCol,
  heat,
  children,
  muted,
  strong,
}: {
  col: HeatColumn
  heatCol: HeatColumn
  heat?: string
  children: React.ReactNode
  muted?: boolean
  strong?: boolean
}) {
  const active = col === heatCol
  return (
    <td
      className={`px-2 py-2.5 text-right tabular-nums ${
        strong ? 'font-medium' : ''
      } ${muted && !active ? 'text-[var(--ink-muted)]' : ''}`}
      style={active && heat ? { background: heat } : undefined}
    >
      {children}
    </td>
  )
}

function Th({
  children,
  onClick,
  align = 'left',
  heated,
}: {
  children: React.ReactNode
  onClick?: () => void
  align?: 'left' | 'right'
  heated?: boolean
}) {
  return (
    <th
      className={`sticky-th px-2 py-2.5 font-medium ${align === 'right' ? 'text-right' : 'text-left'} ${
        onClick ? 'cursor-pointer select-none hover:text-[var(--ink)]' : ''
      } ${heated ? 'text-[var(--ink)] underline decoration-[var(--accent)] underline-offset-4' : ''}`}
      onClick={onClick}
    >
      {children}
    </th>
  )
}
