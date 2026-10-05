import { useEffect, useMemo, useRef, useState } from 'react'
import { CountryFlag } from './CountryFlag'
import { SortableTh } from './SortableTh'
import { makeMetricColorizer, withAlpha } from '../lib/colors'
import {
  aggregateRows,
  bolsonaroVotesDelta,
  countryName,
  fmtCoverage,
  fmtInt,
  fmtPp,
  fmtPpWithVotes,
  fmtShare,
  lulaVotesDelta,
  metricValue,
} from '../lib/format'
import { regionLabel, t } from '../lib/i18n'
import {
  orderedVisibleCols,
  type TableMetricCol,
} from '../lib/tableColumns'
import { useColumnDrag } from '../lib/useColumnDrag'
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
  visibleCols: TableMetricCol[]
  columnOrder: TableMetricCol[]
  onReorderColumns: (from: TableMetricCol, to: TableMetricCol) => void
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
  visibleCols,
  columnOrder,
  onReorderColumns,
}: Props) {
  const totals = useMemo(() => aggregateRows(rows), [rows])
  const visible = useMemo(() => new Set(visibleCols), [visibleCols])
  const metricCols = useMemo(
    () => orderedVisibleCols(columnOrder, visibleCols),
    [columnOrder, visibleCols],
  )
  const { dragProps } = useColumnDrag(onReorderColumns)
  const mixed2022Vs2026 = useMemo(() => {
    const has2026 = rows.some((c) => c.status === 'reported' && c.y2026)
    const hasWithout2026 = rows.some((c) => !(c.status === 'reported' && c.y2026))
    return has2026 && hasWithout2026
  }, [rows])

  const tableRef = useRef<HTMLTableElement>(null)
  const headTableRef = useRef<HTMLTableElement>(null)
  const headScrollRef = useRef<HTMLDivElement>(null)
  const bodyScrollRef = useRef<HTMLDivElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const syncingScroll = useRef(false)
  const inFlowTotalRef = useRef<HTMLTableRowElement>(null)
  const [pinTotal, setPinTotal] = useState(false)

  useEffect(() => {
    const table = tableRef.current
    const row = inFlowTotalRef.current
    if (!table || !row) return

    const update = () => {
      const vh = window.innerHeight
      const tableRect = table.getBoundingClientRect()
      const rowRect = row.getBoundingClientRect()
      const tableInView = tableRect.bottom > 80 && tableRect.top < vh - 40
      // Pin while browsing the table and the real Total is still below the fold
      const totalBelowFold = rowRect.top > vh - 4
      setPinTotal(tableInView && totalBelowFold)
    }

    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    const io = new IntersectionObserver(update, {
      root: null,
      threshold: [0, 0.01, 0.1, 1],
    })
    io.observe(table)
    io.observe(row)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      io.disconnect()
    }
  }, [rows])

  // Keep header/body column widths aligned (separate tables for sticky head).
  useEffect(() => {
    const bodyTable = tableRef.current
    const headTable = headTableRef.current
    if (!bodyTable || !headTable) return

    const syncWidths = () => {
      const bodyCols = bodyTable.querySelectorAll('thead th')
      const headCols = headTable.querySelectorAll('thead th')
      bodyCols.forEach((th, i) => {
        const headTh = headCols[i] as HTMLElement | undefined
        if (!headTh) return
        const w = (th as HTMLElement).getBoundingClientRect().width
        headTh.style.width = `${w}px`
        headTh.style.minWidth = `${w}px`
        headTh.style.maxWidth = `${w}px`
      })
      headTable.style.width = `${bodyTable.getBoundingClientRect().width}px`

      const rankTh = bodyTable.querySelector(
        'thead th.sticky-col-rank',
      ) as HTMLElement | null
      if (rankTh) {
        const rankW = Math.ceil(rankTh.getBoundingClientRect().width)
        bodyTable.style.setProperty('--sticky-rank-width', `${rankW}px`)
        headTable.style.setProperty('--sticky-rank-width', `${rankW}px`)
      }
    }

    syncWidths()
    const ro = new ResizeObserver(syncWidths)
    ro.observe(bodyTable)
    window.addEventListener('resize', syncWidths)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', syncWidths)
    }
  }, [rows, lang, sortKey, sortDir, metric, highlightId, visibleCols])

  const syncScroll = (source: 'head' | 'body') => {
    const head = headScrollRef.current
    const body = bodyScrollRef.current
    const shell = shellRef.current
    if (!head || !body || syncingScroll.current) return
    syncingScroll.current = true
    if (source === 'body') head.scrollLeft = body.scrollLeft
    else body.scrollLeft = head.scrollLeft
    const scrolled = (source === 'body' ? body : head).scrollLeft > 0
    shell?.classList.toggle('is-x-scrolled', scrolled)
    requestAnimationFrame(() => {
      syncingScroll.current = false
    })
  }

  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-[var(--ink-muted)]">{t('noMatch', lang)}</p>
    )
  }

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  const colorize = makeMetricColorizer(metric, allCountries)
  const heatCol = heatColumnForMetric(metric)

  const headerRow = (
    <tr className="border-b border-[var(--line)] text-xs uppercase tracking-wide text-[var(--ink-muted)]">
      <SortableTh align="right" stickyCol="rank">
        {t('rank', lang)}
      </SortableTh>
      <SortableTh
        onClick={() => onSort('country')}
        hint={t('hintCountry', lang)}
        stickyCol="country"
      >
        {t('country', lang)}
        {arrow('country')}
      </SortableTh>
      {metricCols.map((col) => {
        const drag = dragProps(col)
        switch (col) {
          case 'region':
            return (
              <SortableTh
                key={col}
                onClick={() => onSort('region')}
                hint={t('hintRegion', lang)}
                {...drag}
              >
                {t('region', lang)}
                {arrow('region')}
              </SortableTh>
            )
          case 'votes2026':
            return (
              <SortableTh
                key={col}
                onClick={() => onSort('votes2026')}
                align="right"
                hint={t('hintVotes2026', lang)}
                {...drag}
              >
                {t('votes2026', lang)}
                {arrow('votes2026')}
              </SortableTh>
            )
          case 'lulaPct2026':
            return (
              <SortableTh
                key={col}
                onClick={() => onSort('lulaPct2026')}
                align="right"
                heated={heatCol === 'lula2026'}
                hint={t('hintShare2026', lang)}
                {...drag}
              >
                {t('lula', lang)} 2026{arrow('lulaPct2026')}
              </SortableTh>
            )
          case 'bolsonaroPct2026':
            return (
              <SortableTh
                key={col}
                onClick={() => onSort('bolsonaroPct2026')}
                align="right"
                heated={heatCol === 'bolso2026'}
                hint={t('hintShare2026', lang)}
                {...drag}
              >
                {t('fBolsonaro', lang)} 2026{arrow('bolsonaroPct2026')}
              </SortableTh>
            )
          case 'lulaPct2022':
            return (
              <SortableTh
                key={col}
                onClick={() => onSort('lulaPct2022')}
                align="right"
                heated={heatCol === 'lula2022'}
                hint={t('hintShare2022', lang)}
                {...drag}
              >
                {t('lula', lang)} 2022{arrow('lulaPct2022')}
              </SortableTh>
            )
          case 'bolsonaroPct2022':
            return (
              <SortableTh
                key={col}
                onClick={() => onSort('bolsonaroPct2022')}
                align="right"
                heated={heatCol === 'bolso2022'}
                hint={t('hintShare2022', lang)}
                {...drag}
              >
                {t('jBolsonaro', lang)} 2022{arrow('bolsonaroPct2022')}
              </SortableTh>
            )
          case 'lulaChange':
            return (
              <SortableTh
                key={col}
                onClick={() => onSort('lulaChange')}
                align="right"
                heated={heatCol === 'lulaChange'}
                hint={t('hintLulaChange', lang)}
                {...drag}
              >
                {t('lulaChange', lang)}
                {arrow('lulaChange')}
              </SortableTh>
            )
          case 'bolsonaroChange':
            return (
              <SortableTh
                key={col}
                onClick={() => onSort('bolsonaroChange')}
                align="right"
                heated={heatCol === 'bolsonaroChange'}
                hint={t('hintBolsonaroChange', lang)}
                {...drag}
              >
                {t('bolsonaroChange', lang)}
                {arrow('bolsonaroChange')}
              </SortableTh>
            )
          case 'swingToLula':
            return (
              <SortableTh
                key={col}
                onClick={() => onSort('swingToLula')}
                align="right"
                heated={heatCol === 'swingToLula'}
                hint={t('hintSwingToLula', lang)}
                {...drag}
              >
                {t('swingToLula', lang)}
                {arrow('swingToLula')}
              </SortableTh>
            )
          case 'swingToBolsonaro':
            return (
              <SortableTh
                key={col}
                onClick={() => onSort('swingToBolsonaro')}
                align="right"
                heated={heatCol === 'swingToBolsonaro'}
                hint={t('hintSwingToBolsonaro', lang)}
                {...drag}
              >
                {t('swingToBolsonaro', lang)}
                {arrow('swingToBolsonaro')}
              </SortableTh>
            )
          case 'sections':
            return (
              <SortableTh
                key={col}
                align="right"
                hint={t('hintSections', lang)}
                onClick={() => onSort('sections')}
                {...drag}
              >
                {t('notes', lang)}
                {arrow('sections')}
              </SortableTh>
            )
        }
      })}
    </tr>
  )

  const totalCells = (
    <>
      <td className="sticky-col sticky-col-rank px-2 py-2.5 text-right tabular-nums text-[var(--ink-muted)]">
        —
      </td>
      <td className="sticky-col sticky-col-country cell-truncate cell-truncate-country px-2 py-2.5 text-[var(--ink)]">
        <span className="cell-truncate-text">
          {t('tableTotal', lang)}
          {!visible.has('region') ? (
            <span className="ml-2 font-normal text-[var(--ink-muted)]">
              {totals.countries} {t('countries', lang)}
            </span>
          ) : null}
        </span>
      </td>
      {metricCols.map((col) => {
        switch (col) {
          case 'region':
            return (
              <td
                key={col}
                className="px-2 py-2.5 font-normal text-[var(--ink-muted)]"
              >
                {totals.countries} {t('countries', lang)}
              </td>
            )
          case 'votes2026':
            return (
              <td key={col} className="px-2 py-2.5 text-right tabular-nums">
                {fmtInt(totals.valid2026, lang)}
              </td>
            )
          case 'lulaPct2026':
            return (
              <td key={col} className="px-2 py-2.5 text-right tabular-nums">
                {fmtShare(totals.lulaPct2026, totals.lula2026, lang)}
              </td>
            )
          case 'bolsonaroPct2026':
            return (
              <td key={col} className="px-2 py-2.5 text-right tabular-nums">
                {fmtShare(totals.bolsoPct2026, totals.bolso2026, lang)}
              </td>
            )
          case 'lulaPct2022':
            return (
              <td
                key={col}
                className="px-2 py-2.5 text-right tabular-nums font-medium text-[var(--ink-muted)]"
              >
                {fmtShare(totals.lulaPct2022, totals.lula2022, lang)}
              </td>
            )
          case 'bolsonaroPct2022':
            return (
              <td
                key={col}
                className="px-2 py-2.5 text-right tabular-nums font-medium text-[var(--ink-muted)]"
              >
                {fmtShare(totals.bolsoPct2022, totals.bolso2022, lang)}
              </td>
            )
          case 'lulaChange':
            return (
              <td key={col} className="px-2 py-2.5 text-right tabular-nums">
                {fmtPpWithVotes(totals.lulaChange, totals.lulaVotesDelta, lang)}
              </td>
            )
          case 'bolsonaroChange':
            return (
              <td key={col} className="px-2 py-2.5 text-right tabular-nums">
                {fmtPpWithVotes(
                  totals.bolsonaroChange,
                  totals.bolsonaroVotesDelta,
                  lang,
                )}
              </td>
            )
          case 'swingToLula':
            return (
              <td key={col} className="px-2 py-2.5 text-right tabular-nums">
                {fmtPp(totals.swingToLula, lang)}
              </td>
            )
          case 'swingToBolsonaro':
            return (
              <td key={col} className="px-2 py-2.5 text-right tabular-nums">
                {fmtPp(totals.swingToBolsonaro, lang)}
              </td>
            )
          case 'sections':
            return (
              <td
                key={col}
                className="px-2 py-2.5 text-right tabular-nums font-medium text-[var(--ink-muted)]"
              >
                {totals.sectionsCounted != null && totals.sectionsTotal != null
                  ? fmtCoverage({
                      counted: totals.sectionsCounted,
                      total: totals.sectionsTotal,
                    })
                  : '—'}
              </td>
            )
        }
      })}
    </>
  )

  return (
    <div>
      <div className="results-table-shell" ref={shellRef}>
        {/* Sticky header lives outside the body x-scroller so vertical stick works */}
        <div className="table-head-sticky">
          <div
            className="table-x-scroll table-x-scroll--head"
            ref={headScrollRef}
            onScroll={() => syncScroll('head')}
          >
            <table
              ref={headTableRef}
              className="results-table results-table--head w-full text-left text-sm"
            >
              <thead>{headerRow}</thead>
            </table>
          </div>
        </div>

        <div
          className="table-x-scroll"
          ref={bodyScrollRef}
          onScroll={() => syncScroll('body')}
        >
          <table
            ref={tableRef}
            className="results-table results-table--body w-full text-left text-sm"
          >
            <thead aria-hidden="true" className="results-table-width-head">
              {headerRow}
            </thead>
            <tbody>
              {rows.map((c, index) => {
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
                      hi
                        ? 'row-hi bg-[var(--chip)]'
                        : 'hover:bg-[var(--chip-soft)]'
                    }`}
                  >
                    <td className="sticky-col sticky-col-rank px-2 py-2.5 text-right tabular-nums text-[var(--ink-muted)]">
                      {index + 1}
                    </td>
                    <td
                      className="sticky-col sticky-col-country cell-truncate cell-truncate-country px-2 py-2.5 font-medium text-[var(--ink)]"
                      title={countryName(c, lang)}
                    >
                      <span className="country-flag-label">
                        <CountryFlag
                          iso3={c.iso3}
                          title={countryName(c, lang)}
                        />
                        <span className="cell-truncate-text">
                          {countryName(c, lang)}
                        </span>
                      </span>
                      {c.notes?.startsWith('DISPUTED') ? (
                        <span
                          className="mt-0.5 block truncate text-[10px] font-normal text-[var(--ink-muted)]"
                          title={c.notes}
                        >
                          {t('disputedShort', lang)}
                        </span>
                      ) : null}
                    </td>
                    {metricCols.map((col) => {
                      switch (col) {
                        case 'region':
                          return (
                            <td
                              key={col}
                              className="cell-truncate cell-truncate-sm px-2 py-2.5 text-[var(--ink-muted)]"
                              title={regionLabel(c.region, lang)}
                            >
                              {regionLabel(c.region, lang)}
                            </td>
                          )
                        case 'votes2026':
                          return (
                            <td
                              key={col}
                              className="px-2 py-2.5 text-right tabular-nums text-[var(--ink)]"
                            >
                              {fmtInt(c.y2026?.totalValid, lang)}
                            </td>
                          )
                        case 'lulaPct2026':
                          return (
                            <HeatTd
                              key={col}
                              col="lula2026"
                              heatCol={heatCol}
                              heat={heat}
                            >
                              {fmtShare(c.y2026?.lulaPct, c.y2026?.lula, lang)}
                            </HeatTd>
                          )
                        case 'bolsonaroPct2026':
                          return (
                            <HeatTd
                              key={col}
                              col="bolso2026"
                              heatCol={heatCol}
                              heat={heat}
                            >
                              {fmtShare(
                                c.y2026?.bolsonaroPct,
                                c.y2026?.bolsonaro,
                                lang,
                              )}
                            </HeatTd>
                          )
                        case 'lulaPct2022':
                          return (
                            <HeatTd
                              key={col}
                              col="lula2022"
                              heatCol={heatCol}
                              heat={heat}
                              muted
                            >
                              {fmtShare(c.y2022.lulaPct, c.y2022.lula, lang)}
                            </HeatTd>
                          )
                        case 'bolsonaroPct2022':
                          return (
                            <HeatTd
                              key={col}
                              col="bolso2022"
                              heatCol={heatCol}
                              heat={heat}
                              muted
                            >
                              {fmtShare(
                                c.y2022.bolsonaroPct,
                                c.y2022.bolsonaro,
                                lang,
                              )}
                            </HeatTd>
                          )
                        case 'lulaChange':
                          return (
                            <HeatTd
                              key={col}
                              col="lulaChange"
                              heatCol={heatCol}
                              heat={heat}
                              strong
                            >
                              {fmtPpWithVotes(
                                c.swing?.lulaPp,
                                lulaVotesDelta(c),
                                lang,
                              )}
                            </HeatTd>
                          )
                        case 'bolsonaroChange':
                          return (
                            <HeatTd
                              key={col}
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
                          )
                        case 'swingToLula':
                          return (
                            <HeatTd
                              key={col}
                              col="swingToLula"
                              heatCol={heatCol}
                              heat={heat}
                              strong
                            >
                              {fmtPp(
                                c.swing != null
                                  ? c.swing.lulaPp - c.swing.bolsonaroPp
                                  : null,
                                lang,
                              )}
                            </HeatTd>
                          )
                        case 'swingToBolsonaro':
                          return (
                            <HeatTd
                              key={col}
                              col="swingToBolsonaro"
                              heatCol={heatCol}
                              heat={heat}
                              strong
                            >
                              {fmtPp(
                                c.swing != null
                                  ? c.swing.bolsonaroPp - c.swing.lulaPp
                                  : null,
                                lang,
                              )}
                            </HeatTd>
                          )
                        case 'sections':
                          return (
                            <td
                              key={col}
                              className="px-2 py-2.5 text-right tabular-nums text-[var(--ink-muted)]"
                            >
                              {fmtCoverage(c.coverage)}
                            </td>
                          )
                      }
                    })}
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr
                ref={inFlowTotalRef}
                className="border-t-2 border-[var(--line)] text-sm font-semibold"
              >
                {totalCells}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Fixed Total pin — reliable on iOS, no nested scroll container */}
      <div
        className={`total-pin ${pinTotal ? 'total-pin--on' : ''}`}
        aria-hidden={!pinTotal}
      >
        <div className="total-pin-inner">
          <span className="font-semibold text-[var(--ink)]">
            {t('tableTotal', lang)}
          </span>
          <span className="text-[var(--ink-muted)]">
            {totals.countries} {t('countries', lang)}
          </span>
          <span className="tabular-nums">
            <span className="text-[var(--ink-muted)]">{t('lula', lang)} </span>
            {fmtShare(totals.lulaPct2026, totals.lula2026, lang)}
          </span>
          <span className="tabular-nums">
            <span className="text-[var(--ink-muted)]">
              {t('fBolsonaro', lang)}{' '}
            </span>
            {fmtShare(totals.bolsoPct2026, totals.bolso2026, lang)}
          </span>
          <span className="tabular-nums font-semibold">
            <span className="text-[var(--ink-muted)]">
              {t('swingToLula', lang)}{' '}
            </span>
            {fmtPp(totals.swingToLula, lang)}
          </span>
        </div>
      </div>

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

