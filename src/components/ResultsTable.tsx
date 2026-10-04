import { useMemo } from 'react'
import { makeMetricColorizer, withAlpha } from '../lib/colors'
import {
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

type RowTotals = {
  countries: number
  lula2026: number | null
  bolso2026: number | null
  valid2026: number | null
  lulaPct2026: number | null
  bolsoPct2026: number | null
  lula2022: number
  bolso2022: number
  valid2022: number
  lulaPct2022: number
  bolsoPct2022: number
  lulaChange: number | null
  bolsonaroChange: number | null
  swingToLula: number | null
  lulaVotesDelta: number | null
  bolsonaroVotesDelta: number | null
  sectionsCounted: number | null
  sectionsTotal: number | null
}

function sumRows(rows: CountryResult[]): RowTotals {
  let lula2026 = 0
  let bolso2026 = 0
  let valid2026 = 0
  let has2026 = false
  let lula2022 = 0
  let bolso2022 = 0
  let valid2022 = 0
  // 2022 baseline limited to countries that also have 2026 results,
  // so change/swing compare the same country set.
  let lula2022Comparable = 0
  let bolso2022Comparable = 0
  let valid2022Comparable = 0
  let sectionsCounted = 0
  let sectionsTotal = 0
  let hasSections = false

  for (const c of rows) {
    lula2022 += c.y2022.lula
    bolso2022 += c.y2022.bolsonaro
    valid2022 += c.y2022.totalValid
    if (c.status === 'reported' && c.y2026) {
      has2026 = true
      lula2026 += c.y2026.lula
      bolso2026 += c.y2026.bolsonaro
      valid2026 += c.y2026.totalValid
      lula2022Comparable += c.y2022.lula
      bolso2022Comparable += c.y2022.bolsonaro
      valid2022Comparable += c.y2022.totalValid
    }
    if (c.coverage) {
      hasSections = true
      sectionsCounted += c.coverage.counted
      sectionsTotal += c.coverage.total
    }
  }

  const lulaPct2022 = valid2022 ? (lula2022 / valid2022) * 100 : 0
  const bolsoPct2022 = valid2022 ? (bolso2022 / valid2022) * 100 : 0
  const lulaPct2026 = has2026 && valid2026 ? (lula2026 / valid2026) * 100 : null
  const bolsoPct2026 = has2026 && valid2026 ? (bolso2026 / valid2026) * 100 : null
  const lulaPct2022Comparable = valid2022Comparable
    ? (lula2022Comparable / valid2022Comparable) * 100
    : null
  const bolsoPct2022Comparable = valid2022Comparable
    ? (bolso2022Comparable / valid2022Comparable) * 100
    : null
  const lulaChange =
    lulaPct2026 != null && lulaPct2022Comparable != null
      ? lulaPct2026 - lulaPct2022Comparable
      : null
  const bolsonaroChange =
    bolsoPct2026 != null && bolsoPct2022Comparable != null
      ? bolsoPct2026 - bolsoPct2022Comparable
      : null
  const swingToLula =
    lulaChange != null && bolsonaroChange != null
      ? lulaChange - bolsonaroChange
      : null

  return {
    countries: rows.length,
    lula2026: has2026 ? lula2026 : null,
    bolso2026: has2026 ? bolso2026 : null,
    valid2026: has2026 ? valid2026 : null,
    lulaPct2026,
    bolsoPct2026,
    lula2022,
    bolso2022,
    valid2022,
    lulaPct2022,
    bolsoPct2022,
    lulaChange,
    bolsonaroChange,
    swingToLula,
    lulaVotesDelta: has2026 ? lula2026 - lula2022Comparable : null,
    bolsonaroVotesDelta: has2026 ? bolso2026 - bolso2022Comparable : null,
    sectionsCounted: hasSections ? sectionsCounted : null,
    sectionsTotal: hasSections ? sectionsTotal : null,
  }
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
  const totals = useMemo(() => sumRows(rows), [rows])

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
      <table className="w-full min-w-[960px] border-collapse text-left text-sm">
        <thead className="sticky top-0 z-20">
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
                <HeatTd col="bolsonaroChange" heatCol={heatCol} heat={heat} strong>
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
        <tfoot className="sticky bottom-0 z-20">
          <tr className="border-t-2 border-[var(--line)] text-sm font-semibold">
            <td className="sticky-tf px-2 py-2.5 text-[var(--ink)]">
              {t('tableTotal', lang)}
            </td>
            <td className="sticky-tf px-2 py-2.5 text-[var(--ink-muted)] font-normal">
              {totals.countries} {t('countries', lang)}
            </td>
            <td className="sticky-tf px-2 py-2.5 text-right tabular-nums">
              {fmtShare(totals.lulaPct2026, totals.lula2026, lang)}
            </td>
            <td className="sticky-tf px-2 py-2.5 text-right tabular-nums">
              {fmtShare(totals.bolsoPct2026, totals.bolso2026, lang)}
            </td>
            <td className="sticky-tf px-2 py-2.5 text-right tabular-nums text-[var(--ink-muted)] font-medium">
              {fmtShare(totals.lulaPct2022, totals.lula2022, lang)}
            </td>
            <td className="sticky-tf px-2 py-2.5 text-right tabular-nums text-[var(--ink-muted)] font-medium">
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
            <td className="sticky-tf px-2 py-2.5 text-right tabular-nums text-[var(--ink-muted)] font-medium">
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
