import { useEffect, useMemo, useRef } from 'react'
import { CountryFlag } from './CountryFlag'
import { SortableTh } from './SortableTh'
import {
  cityBolsonaroChange,
  cityLulaChange,
  citySwingToBolsonaro,
  citySwingToLula,
  type CityTableRow,
} from '../lib/cityRows'
import {
  cityDisplayName,
  countryAbbrev,
  countryName,
  fmtCoverage,
  fmtInt,
  fmtPp,
  fmtShare,
} from '../lib/format'
import { regionLabel, t } from '../lib/i18n'
import {
  orderedVisibleCols,
  type TableMetricCol,
} from '../lib/tableColumns'
import { useColumnDrag } from '../lib/useColumnDrag'
import type { CountryResult, Lang, SortKey } from '../types'

type Props = {
  rows: CityTableRow[]
  countries: Map<string, CountryResult>
  lang: Lang
  loading?: boolean
  showCountry: boolean
  /** Column label + empty/footer wording for Area vs City tabs. */
  placeKind?: 'area' | 'city'
  sortKey: SortKey
  sortDir: 'asc' | 'desc'
  onSort: (key: SortKey) => void
  footerNote?: string | null
  visibleCols: TableMetricCol[]
  columnOrder: TableMetricCol[]
  onReorderColumns: (from: TableMetricCol, to: TableMetricCol) => void
}

export function CityBreakdownTable({
  rows,
  countries,
  lang,
  loading,
  showCountry,
  placeKind = 'city',
  sortKey,
  sortDir,
  onSort,
  footerNote,
  visibleCols,
  columnOrder,
  onReorderColumns,
}: Props) {
  const tableRef = useRef<HTMLTableElement>(null)
  const metricCols = useMemo(
    () => orderedVisibleCols(columnOrder, visibleCols),
    [columnOrder, visibleCols],
  )
  const { dragProps } = useColumnDrag(onReorderColumns)

  const totals = useMemo(() => {
    let lula = 0
    let bolsonaro = 0
    let valid = 0
    let lula2022 = 0
    let bolso2022 = 0
    let valid2022 = 0
    let has2022 = false
    let counted = 0
    let total = 0
    for (const c of rows) {
      lula += c.y2026.lula
      bolsonaro += c.y2026.bolsonaro
      valid += c.y2026.totalValid
      counted += c.coverage?.counted ?? 0
      total += c.coverage?.total ?? 0
      if (c.y2022) {
        has2022 = true
        lula2022 += c.y2022.lula
        bolso2022 += c.y2022.bolsonaro
        valid2022 += c.y2022.totalValid
      }
    }
    const lulaPct = valid ? (lula / valid) * 100 : null
    const bolsoPct = valid ? (bolsonaro / valid) * 100 : null
    const lulaPct2022 = has2022 && valid2022 ? (lula2022 / valid2022) * 100 : null
    const bolsoPct2022 =
      has2022 && valid2022 ? (bolso2022 / valid2022) * 100 : null
    const lulaChange =
      lulaPct != null && lulaPct2022 != null ? lulaPct - lulaPct2022 : null
    const bolsonaroChange =
      bolsoPct != null && bolsoPct2022 != null ? bolsoPct - bolsoPct2022 : null
    const swingToLula =
      lulaChange != null && bolsonaroChange != null
        ? lulaChange - bolsonaroChange
        : null
    const swingToBolsonaro =
      lulaChange != null && bolsonaroChange != null
        ? bolsonaroChange - lulaChange
        : null
    return {
      lula,
      bolsonaro,
      valid,
      lulaPct,
      bolsoPct,
      lula2022,
      bolso2022,
      lulaPct2022,
      bolsoPct2022,
      lulaChange,
      bolsonaroChange,
      swingToLula,
      swingToBolsonaro,
      coverage: total > 0 ? { counted, total } : null,
    }
  }, [rows])

  useEffect(() => {
    const table = tableRef.current
    if (!table) return
    const sync = () => {
      const rankTh = table.querySelector(
        'thead th.sticky-col-rank',
      ) as HTMLElement | null
      if (!rankTh) return
      const rankW = Math.ceil(rankTh.getBoundingClientRect().width)
      table.style.setProperty('--sticky-rank-width', `${rankW}px`)
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(table)
    window.addEventListener('resize', sync)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', sync)
    }
  }, [rows, showCountry, visibleCols])

  if (loading) {
    return (
      <p className="py-8 text-center text-[var(--ink-muted)]">
        {t('cityLoading', lang)}
      </p>
    )
  }

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-[var(--ink-muted)]">
        {t(placeKind === 'area' ? 'areaEmpty' : 'cityEmpty', lang)}
      </p>
    )
  }

  const placeLabel = t(placeKind === 'area' ? 'area' : 'city', lang)
  const placeHint = t(placeKind === 'area' ? 'hintArea' : 'hintCity', lang)
  const placeCountLabel = t(placeKind === 'area' ? 'areas' : 'cities', lang)

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  const singleCountry =
    !showCountry && rows[0] ? countries.get(rows[0].countryId) : null

  return (
    <div>
      <div
        className="table-x-scroll"
        onScroll={(e) => {
          e.currentTarget.classList.toggle(
            'is-x-scrolled',
            e.currentTarget.scrollLeft > 0,
          )
        }}
      >
        <table
          ref={tableRef}
          className="results-table results-table--cities text-left text-sm"
        >
          <thead>
            <tr className="border-b border-[var(--line)] text-xs uppercase tracking-wide text-[var(--ink-muted)]">
              <SortableTh align="right" stickyCol="rank">
                {t('rank', lang)}
              </SortableTh>
              {showCountry ? (
                <SortableTh
                  onClick={() => onSort('country')}
                  hint={t('hintCountry', lang)}
                  stickyCol="country"
                  className="cell-truncate-abbr"
                >
                  {t('country', lang)}
                  {arrow('country')}
                </SortableTh>
              ) : null}
              <SortableTh
                onClick={() => onSort('city')}
                hint={placeHint}
                stickyCol={showCountry ? undefined : 'city'}
                className="cell-truncate-city"
              >
                {placeLabel}
                {arrow('city')}
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
                        align="right"
                        hint={t('hintVotes2026', lang)}
                        onClick={() => onSort('votes2026')}
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
                        align="right"
                        hint={t('hintShare2026', lang)}
                        onClick={() => onSort('lulaPct2026')}
                        {...drag}
                      >
                        {t('lula', lang)} 2026{arrow('lulaPct2026')}
                      </SortableTh>
                    )
                  case 'bolsonaroPct2026':
                    return (
                      <SortableTh
                        key={col}
                        align="right"
                        hint={t('hintShare2026', lang)}
                        onClick={() => onSort('bolsonaroPct2026')}
                        {...drag}
                      >
                        {t('fBolsonaro', lang)} 2026{arrow('bolsonaroPct2026')}
                      </SortableTh>
                    )
                  case 'lulaPct2022':
                    return (
                      <SortableTh
                        key={col}
                        align="right"
                        hint={t('hintShare2022', lang)}
                        onClick={() => onSort('lulaPct2022')}
                        {...drag}
                      >
                        {t('lula', lang)} 2022{arrow('lulaPct2022')}
                      </SortableTh>
                    )
                  case 'bolsonaroPct2022':
                    return (
                      <SortableTh
                        key={col}
                        align="right"
                        hint={t('hintShare2022', lang)}
                        onClick={() => onSort('bolsonaroPct2022')}
                        {...drag}
                      >
                        {t('jBolsonaro', lang)} 2022{arrow('bolsonaroPct2022')}
                      </SortableTh>
                    )
                  case 'lulaChange':
                    return (
                      <SortableTh
                        key={col}
                        align="right"
                        hint={t('hintLulaChange', lang)}
                        onClick={() => onSort('lulaChange')}
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
                        align="right"
                        hint={t('hintBolsonaroChange', lang)}
                        onClick={() => onSort('bolsonaroChange')}
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
                        align="right"
                        hint={t('hintSwingToLula', lang)}
                        onClick={() => onSort('swingToLula')}
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
                        align="right"
                        hint={t('hintSwingToBolsonaro', lang)}
                        onClick={() => onSort('swingToBolsonaro')}
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
          </thead>
          <tbody>
            {rows.map((c, index) => {
              const parent = countries.get(c.countryId)
              const fullCountry = parent
                ? countryName(parent, lang)
                : c.countryId
              const abbr = parent ? countryAbbrev(parent, lang) : c.countryId
              return (
                <tr
                  key={`${c.countryId}-${c.code}`}
                  className="border-b border-[var(--line-soft)] hover:bg-[var(--chip-soft)]"
                >
                  <td className="sticky-col sticky-col-rank px-2 py-2.5 text-right tabular-nums text-[var(--ink-muted)]">
                    {index + 1}
                  </td>
                  {showCountry ? (
                    <td
                      className="sticky-col sticky-col-country cell-truncate cell-truncate-abbr px-2 py-2.5 text-[var(--ink)]"
                      title={fullCountry}
                    >
                      <span className="country-flag-label">
                        {parent ? (
                          <CountryFlag iso3={parent.iso3} title={fullCountry} />
                        ) : null}
                        <span className="cell-truncate-text">{abbr}</span>
                      </span>
                    </td>
                  ) : null}
                  <td
                    className={`${
                      showCountry
                        ? ''
                        : 'sticky-col sticky-col-city '
                    }cell-truncate cell-truncate-city px-2 py-2.5 font-medium text-[var(--ink)]`}
                    title={cityDisplayName(c, lang)}
                  >
                    <span className="cell-truncate-text">
                      {cityDisplayName(c, lang)}
                    </span>
                  </td>
                  {metricCols.map((col) => {
                    switch (col) {
                      case 'region':
                        return (
                          <td
                            key={col}
                            className="cell-truncate cell-truncate-sm px-2 py-2.5 text-[var(--ink-muted)]"
                            title={
                              parent
                                ? regionLabel(parent.region, lang)
                                : undefined
                            }
                          >
                            {parent ? regionLabel(parent.region, lang) : '—'}
                          </td>
                        )
                      case 'votes2026':
                        return (
                          <td
                            key={col}
                            className="px-2 py-2.5 text-right tabular-nums"
                          >
                            {fmtInt(c.y2026.totalValid, lang)}
                          </td>
                        )
                      case 'lulaPct2026':
                        return (
                          <td
                            key={col}
                            className="px-2 py-2.5 text-right tabular-nums"
                          >
                            {fmtShare(c.y2026.lulaPct, c.y2026.lula, lang)}
                          </td>
                        )
                      case 'bolsonaroPct2026':
                        return (
                          <td
                            key={col}
                            className="px-2 py-2.5 text-right tabular-nums"
                          >
                            {fmtShare(
                              c.y2026.bolsonaroPct,
                              c.y2026.bolsonaro,
                              lang,
                            )}
                          </td>
                        )
                      case 'lulaPct2022':
                        return (
                          <td
                            key={col}
                            className="px-2 py-2.5 text-right tabular-nums text-[var(--ink-muted)]"
                          >
                            {fmtShare(c.y2022?.lulaPct, c.y2022?.lula, lang)}
                          </td>
                        )
                      case 'bolsonaroPct2022':
                        return (
                          <td
                            key={col}
                            className="px-2 py-2.5 text-right tabular-nums text-[var(--ink-muted)]"
                          >
                            {fmtShare(
                              c.y2022?.bolsonaroPct,
                              c.y2022?.bolsonaro,
                              lang,
                            )}
                          </td>
                        )
                      case 'lulaChange':
                        return (
                          <td
                            key={col}
                            className="px-2 py-2.5 text-right tabular-nums"
                          >
                            {fmtPp(cityLulaChange(c), lang)}
                          </td>
                        )
                      case 'bolsonaroChange':
                        return (
                          <td
                            key={col}
                            className="px-2 py-2.5 text-right tabular-nums"
                          >
                            {fmtPp(cityBolsonaroChange(c), lang)}
                          </td>
                        )
                      case 'swingToLula':
                        return (
                          <td
                            key={col}
                            className="px-2 py-2.5 text-right tabular-nums"
                          >
                            {fmtPp(citySwingToLula(c), lang)}
                          </td>
                        )
                      case 'swingToBolsonaro':
                        return (
                          <td
                            key={col}
                            className="px-2 py-2.5 text-right tabular-nums"
                          >
                            {fmtPp(citySwingToBolsonaro(c), lang)}
                          </td>
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
            <tr className="border-t-2 border-[var(--line)] text-sm font-semibold">
              <td className="sticky-col sticky-col-rank px-2 py-2.5 text-right tabular-nums text-[var(--ink-muted)]">
                —
              </td>
              {showCountry ? (
                <td
                  className="sticky-col sticky-col-country cell-truncate cell-truncate-abbr px-2 py-2.5 text-[var(--ink-muted)]"
                  title={
                    singleCountry ? countryName(singleCountry, lang) : undefined
                  }
                >
                  {singleCountry ? countryAbbrev(singleCountry, lang) : '—'}
                </td>
              ) : null}
              <td
                className={`${
                  showCountry ? '' : 'sticky-col sticky-col-city '
                }cell-truncate cell-truncate-city px-2 py-2.5 text-[var(--ink)]`}
              >
                <span className="cell-truncate-text">
                  {t('tableTotal', lang)}
                  <span className="ml-2 font-normal text-[var(--ink-muted)]">
                    {rows.length} {placeCountLabel}
                  </span>
                </span>
              </td>
              {metricCols.map((col) => {
                switch (col) {
                  case 'region':
                    return (
                      <td key={col} className="px-2 py-2.5 text-[var(--ink-muted)]">
                        {singleCountry
                          ? regionLabel(singleCountry.region, lang)
                          : '—'}
                      </td>
                    )
                  case 'votes2026':
                    return (
                      <td
                        key={col}
                        className="px-2 py-2.5 text-right tabular-nums"
                      >
                        {fmtInt(totals.valid, lang)}
                      </td>
                    )
                  case 'lulaPct2026':
                    return (
                      <td
                        key={col}
                        className="px-2 py-2.5 text-right tabular-nums"
                      >
                        {fmtShare(totals.lulaPct, totals.lula, lang)}
                      </td>
                    )
                  case 'bolsonaroPct2026':
                    return (
                      <td
                        key={col}
                        className="px-2 py-2.5 text-right tabular-nums"
                      >
                        {fmtShare(totals.bolsoPct, totals.bolsonaro, lang)}
                      </td>
                    )
                  case 'lulaPct2022':
                    return (
                      <td
                        key={col}
                        className="px-2 py-2.5 text-right tabular-nums text-[var(--ink-muted)]"
                      >
                        {fmtShare(totals.lulaPct2022, totals.lula2022, lang)}
                      </td>
                    )
                  case 'bolsonaroPct2022':
                    return (
                      <td
                        key={col}
                        className="px-2 py-2.5 text-right tabular-nums text-[var(--ink-muted)]"
                      >
                        {fmtShare(totals.bolsoPct2022, totals.bolso2022, lang)}
                      </td>
                    )
                  case 'lulaChange':
                    return (
                      <td
                        key={col}
                        className="px-2 py-2.5 text-right tabular-nums"
                      >
                        {fmtPp(totals.lulaChange, lang)}
                      </td>
                    )
                  case 'bolsonaroChange':
                    return (
                      <td
                        key={col}
                        className="px-2 py-2.5 text-right tabular-nums"
                      >
                        {fmtPp(totals.bolsonaroChange, lang)}
                      </td>
                    )
                  case 'swingToLula':
                    return (
                      <td
                        key={col}
                        className="px-2 py-2.5 text-right tabular-nums"
                      >
                        {fmtPp(totals.swingToLula, lang)}
                      </td>
                    )
                  case 'swingToBolsonaro':
                    return (
                      <td
                        key={col}
                        className="px-2 py-2.5 text-right tabular-nums"
                      >
                        {fmtPp(totals.swingToBolsonaro, lang)}
                      </td>
                    )
                  case 'sections':
                    return (
                      <td
                        key={col}
                        className="px-2 py-2.5 text-right tabular-nums text-[var(--ink-muted)]"
                      >
                        {fmtCoverage(totals.coverage)}
                      </td>
                    )
                }
              })}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-2 px-1 text-xs text-[var(--ink-muted)]">
        {footerNote ?? t('cityNo2022Footnote', lang)}
      </p>
    </div>
  )
}
