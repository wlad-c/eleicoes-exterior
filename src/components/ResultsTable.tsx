import { useMemo } from 'react'
import { makeMetricColorizer, withAlpha } from '../lib/colors'
import {
  aggregateRows,
  bolsonaroVotesDelta,
  countryName,
  fmtCoverage,
  fmtPp,
  fmtPpWithVotes,
  fmtShare,
  lulaVotesDelta,
  metricValue,
} from '../lib/format'
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
  const totals = useMemo(() => aggregateRows(rows), [rows])
  const mixed2022Vs2026 = useMemo(() => {
    const has2026 = rows.some((c) => c.status === 'reported' && c.y2026)
    const hasWithout2026 = rows.some((c) => !(c.status === 'reported' && c.y2026))
    return has2026 && hasWithout2026
  }, [rows])

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
    <div>
      <table className="results-table w-full min-w-[960px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] text-xs uppercase tracking-wide text-[var(--ink-muted)]">
              <Th
                onClick={() => onSort('country')}
                hint={t('hintCountry', lang)}
              >
                {t('country', lang)}
                {arrow('country')}
              </Th>
              <Th
                onClick={() => onSort('region')}
                hint={t('hintRegion', lang)}
              >
                {t('region', lang)}
                {arrow('region')}
              </Th>
              <Th
                onClick={() => onSort('lulaPct2026')}
                align="right"
                heated={heatCol === 'lula2026'}
                hint={t('hintShare2026', lang)}
              >
                {t('lula', lang)} 2026{arrow('lulaPct2026')}
              </Th>
              <Th
                onClick={() => onSort('bolsonaroPct2026')}
                align="right"
                heated={heatCol === 'bolso2026'}
                hint={t('hintShare2026', lang)}
              >
                {t('fBolsonaro', lang)} 2026{arrow('bolsonaroPct2026')}
              </Th>
              <Th
                onClick={() => onSort('votes2022')}
                align="right"
                heated={heatCol === 'lula2022'}
                hint={t('hintShare2022', lang)}
              >
                {t('lula', lang)} 2022{arrow('votes2022')}
              </Th>
              <Th
                align="right"
                heated={heatCol === 'bolso2022'}
                hint={t('hintShare2022', lang)}
              >
                {t('jBolsonaro', lang)} 2022
              </Th>
              <Th
                onClick={() => onSort('lulaChange')}
                align="right"
                heated={heatCol === 'lulaChange'}
                hint={t('hintLulaChange', lang)}
              >
                {t('lulaChange', lang)}
                {arrow('lulaChange')}
              </Th>
              <Th
                onClick={() => onSort('bolsonaroChange')}
                align="right"
                heated={heatCol === 'bolsonaroChange'}
                hint={t('hintBolsonaroChange', lang)}
              >
                {t('bolsonaroChange', lang)}
                {arrow('bolsonaroChange')}
              </Th>
              <Th
                onClick={() => onSort('swingToLula')}
                align="right"
                heated={heatCol === 'swingToLula'}
                hint={t('hintSwingToLula', lang)}
              >
                {t('swingToLula', lang)}
                {arrow('swingToLula')}
              </Th>
              <Th align="right" hint={t('hintSections', lang)}>
                {t('notes', lang)}
              </Th>
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
                    {c.notes?.startsWith('DISPUTED') ? (
                      <span
                        className="mt-0.5 block text-[10px] font-normal leading-snug text-[var(--ink-muted)]"
                        title={c.notes}
                      >
                        {t('disputedShort', lang)}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-2.5 text-[var(--ink-muted)]">
                    {regionLabel(c.region, lang)}
                  </td>
                  <HeatTd col="lula2026" heatCol={heatCol} heat={heat}>
                    {fmtShare(c.y2026?.lulaPct, c.y2026?.lula, lang)}
                  </HeatTd>
                  <HeatTd col="bolso2026" heatCol={heatCol} heat={heat}>
                    {fmtShare(c.y2026?.bolsonaroPct, c.y2026?.bolsonaro, lang)}
                  </HeatTd>
                  <HeatTd col="lula2022" heatCol={heatCol} heat={heat} muted>
                    {fmtShare(c.y2022.lulaPct, c.y2022.lula, lang)}
                  </HeatTd>
                  <HeatTd col="bolso2022" heatCol={heatCol} heat={heat} muted>
                    {fmtShare(c.y2022.bolsonaroPct, c.y2022.bolsonaro, lang)}
                  </HeatTd>
                  <HeatTd col="lulaChange" heatCol={heatCol} heat={heat} strong>
                    {fmtPpWithVotes(c.swing?.lulaPp, lulaVotesDelta(c), lang)}
                  </HeatTd>
                  <HeatTd
                    col="bolsonaroChange"
                    heatCol={heatCol}
                    heat={heat}
                    strong
                  >
                    {fmtPpWithVotes(
                      c.swing?.bolsonaroPp,
                      bolsonaroVotesDelta(c),
                      lang,
                    )}
                  </HeatTd>
                  <HeatTd col="swingToLula" heatCol={heatCol} heat={heat} strong>
                    {fmtPp(
                      c.swing != null
                        ? c.swing.lulaPp - c.swing.bolsonaroPp
                        : null,
                      lang,
                    )}
                  </HeatTd>
                  <td className="px-2 py-2.5 text-right tabular-nums text-[var(--ink-muted)]">
                    {fmtCoverage(c.coverage)}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--line)] text-sm font-semibold">
              <td className="sticky-tf px-2 py-2.5 text-[var(--ink)]">
                {t('tableTotal', lang)}
              </td>
              <td className="sticky-tf px-2 py-2.5 font-normal text-[var(--ink-muted)]">
                {totals.countries} {t('countries', lang)}
              </td>
              <td className="sticky-tf px-2 py-2.5 text-right tabular-nums">
                {fmtShare(totals.lulaPct2026, totals.lula2026, lang)}
              </td>
              <td className="sticky-tf px-2 py-2.5 text-right tabular-nums">
                {fmtShare(totals.bolsoPct2026, totals.bolso2026, lang)}
              </td>
              <td className="sticky-tf px-2 py-2.5 text-right tabular-nums font-medium text-[var(--ink-muted)]">
                {fmtShare(totals.lulaPct2022, totals.lula2022, lang)}
              </td>
              <td className="sticky-tf px-2 py-2.5 text-right tabular-nums font-medium text-[var(--ink-muted)]">
                {fmtShare(totals.bolsoPct2022, totals.bolso2022, lang)}
              </td>
              <td className="sticky-tf px-2 py-2.5 text-right tabular-nums">
                {fmtPpWithVotes(totals.lulaChange, totals.lulaVotesDelta, lang)}
              </td>
              <td className="sticky-tf px-2 py-2.5 text-right tabular-nums">
                {fmtPpWithVotes(
                  totals.bolsonaroChange,
                  totals.bolsonaroVotesDelta,
                  lang,
                )}
              </td>
              <td className="sticky-tf px-2 py-2.5 text-right tabular-nums">
                {fmtPp(totals.swingToLula, lang)}
              </td>
              <td className="sticky-tf px-2 py-2.5 text-right tabular-nums font-medium text-[var(--ink-muted)]">
                {totals.sectionsCounted != null && totals.sectionsTotal != null
                  ? fmtCoverage({
                      counted: totals.sectionsCounted,
                      total: totals.sectionsTotal,
                    })
                  : '—'}
              </td>
            </tr>
          </tfoot>
      </table>
      {mixed2022Vs2026 ? (
        <p className="mt-2 px-1 text-xs text-[var(--ink-muted)]">
          {t('totalFootnoteMixed', lang)}
        </p>
      ) : null}
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
  hint,
  onClick,
  align = 'left',
  heated,
}: {
  children: React.ReactNode
  hint?: string
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
      <span className="block normal-case tracking-normal">
        <span className="block text-[11px] font-semibold uppercase tracking-wide">
          {children}
        </span>
        {hint ? (
          <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal text-[var(--ink-muted)] opacity-90">
            {hint}
          </span>
        ) : null}
      </span>
    </th>
  )
}
