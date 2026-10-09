import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CountryFlag } from './CountryFlag'
import { NameTip } from './NameTip'
import { SortableTh } from './SortableTh'

/** Window large breakdown tables (Brazil municipalities) without dropping rows. */
const VIRTUALIZE_AT = 80
const ROW_ESTIMATE_PX = 42
import {
  cityBolsonaroChange,
  cityBolsonaroVotesDelta,
  cityLulaChange,
  cityLulaVotesDelta,
  citySwingToBolsonaro,
  citySwingToLula,
  type CityTableRow,
} from '../lib/cityRows'
import {
  areaDisplayName,
  cityDisplayName,
  cityPlaceParentLabel,
  countryAbbrev,
  countryName,
  placeParentLabel,
  placeParentLabelCompact,
  placeParentUf,
  fmtCoverage,
  fmtInt,
  fmtPp,
  fmtPpWithVotes,
  fmtShare,
} from '../lib/format'
import { foldForSearch } from '../lib/searchText'
import { regionLabel, t } from '../lib/i18n'
import {
  orderedVisibleCols,
  type TableMetricCol,
} from '../lib/tableColumns'
import { useColumnDrag } from '../lib/useColumnDrag'
import { useHorizontalTouchScroll } from '../lib/useHorizontalTouchScroll'
import {
  useAreaUfCompact,
  useCountryLabelMode,
  useTableCompactMetrics,
} from '../lib/useMediaQuery'
import { useVisualViewportBottom } from '../lib/useVisualViewportBottom'
import type { CountryResult, Lang, SortKey } from '../types'

type Props = {
  rows: CityTableRow[]
  countries: Map<string, CountryResult>
  lang: Lang
  loading?: boolean
  /** Failed to load Local-tab payload (not the same as empty filters). */
  loadError?: string | null
  onRetryLoad?: () => void
  showCountry: boolean
  /** Column label + empty/footer wording for Area / City / Suburb tabs. */
  placeKind?: 'area' | 'city' | 'suburb'
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
  loadError,
  onRetryLoad,
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
  const headTableRef = useRef<HTMLTableElement>(null)
  const footTableRef = useRef<HTMLTableElement>(null)
  const headScrollRef = useRef<HTMLDivElement>(null)
  /** Horizontal body scroller (always). */
  const bodyScrollRef = useRef<HTMLDivElement>(null)
  /** Vertical virtualizer scroller (outer); null when not virtualizing. */
  const bodyYScrollRef = useRef<HTMLDivElement>(null)
  const footScrollRef = useRef<HTMLDivElement>(null)
  const totalPinRef = useRef<HTMLDivElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const syncingScroll = useRef(false)
  const [pinTotal, setPinTotal] = useState(false)
  useVisualViewportBottom(totalPinRef, pinTotal)
  /** Flag-only on very small screens; otherwise abbreviations. */
  const countryLabelMode = useCountryLabelMode()
  const flagOnlyLabels = countryLabelMode === 'flag'
  const areaUfCompact = useAreaUfCompact()
  const compactMetrics = useTableCompactMetrics()
  const shareOpts = compactMetrics ? { compact: true } : undefined
  /** Area tab: Brazilian UFs → SP/RJ/… instead of truncated full names. */
  const preferBrazilUf = placeKind === 'area' && areaUfCompact
  const tableKindClass =
    placeKind === 'suburb' ? 'results-table--suburb' : ''
  const countryColClass = flagOnlyLabels
    ? 'cell-truncate-flag'
    : 'cell-truncate-abbr'
  const metricCols = useMemo(
    () => orderedVisibleCols(columnOrder, visibleCols),
    [columnOrder, visibleCols],
  )
  const { dragProps } = useColumnDrag(onReorderColumns)
  const shouldVirtualize = rows.length >= VIRTUALIZE_AT
  const colCount =
    1 /* rank */ +
    (showCountry ? 1 : 0) +
    1 /* place */ +
    metricCols.length +
    1 /* trailing spacer */

  /**
   * Split axes for iOS: outer = vertical virtualizer, inner = horizontal pan.
   * A single element with overflow-x+y auto still drops sideways gestures on
   * Safari when sticky columns are present.
   */
  const rowEstimatePx =
    placeKind === 'suburb' ? ROW_ESTIMATE_PX + 28 : ROW_ESTIMATE_PX + 4
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () =>
      shouldVirtualize ? bodyYScrollRef.current : bodyScrollRef.current,
    estimateSize: () => rowEstimatePx,
    measureElement:
      typeof window !== 'undefined'
        ? (el) => el.getBoundingClientRect().height
        : undefined,
    overscan: 24,
    enabled: shouldVirtualize,
  })
  const virtualItems = shouldVirtualize ? virtualizer.getVirtualItems() : null
  const paddingTop = virtualItems?.[0]?.start ?? 0
  const paddingBottom = virtualItems
    ? Math.max(
        0,
        virtualizer.getTotalSize() -
          (virtualItems[virtualItems.length - 1]?.end ?? 0),
      )
    : 0

  const totals = useMemo(() => {
    let lula = 0
    let bolsonaro = 0
    let valid = 0
    let lula2022 = 0
    let bolso2022 = 0
    let valid2022 = 0
    let lula2022Comparable = 0
    let bolso2022Comparable = 0
    let lula2026Comparable = 0
    let bolso2026Comparable = 0
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
        lula2022Comparable += c.y2022.lula
        bolso2022Comparable += c.y2022.bolsonaro
        lula2026Comparable += c.y2026.lula
        bolso2026Comparable += c.y2026.bolsonaro
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
      valid2022: has2022 ? valid2022 : null,
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
      lulaVotesDelta: has2022
        ? lula2026Comparable - lula2022Comparable
        : null,
      bolsonaroVotesDelta: has2022
        ? bolso2026Comparable - bolso2022Comparable
        : null,
      coverage: total > 0 ? { counted, total } : null,
    }
  }, [rows])

  useEffect(() => {
    const bodyTable = tableRef.current
    const headTable = headTableRef.current
    const footTable = footTableRef.current
    const bodyScroll = bodyScrollRef.current
    const footScroll = footScrollRef.current
    if (!bodyTable || !headTable || !footTable || !bodyScroll || !footScroll)
      return

    const applyColWidth = (el: HTMLElement | undefined, w: number) => {
      if (!el) return
      el.style.width = `${w}px`
      el.style.minWidth = `${w}px`
      el.style.maxWidth = `${w}px`
    }

    const sync = () => {
      const bodyCols = bodyTable.querySelectorAll('thead th')
      const headCols = headTable.querySelectorAll('thead th')
      const footCols = footTable.querySelectorAll('tr td')
      const tableW = bodyTable.getBoundingClientRect().width
      bodyCols.forEach((th, i) => {
        const w = (th as HTMLElement).getBoundingClientRect().width
        applyColWidth(headCols[i] as HTMLElement | undefined, w)
        applyColWidth(footCols[i] as HTMLElement | undefined, w)
      })
      headTable.style.width = `${tableW}px`
      footTable.style.width = `${tableW}px`

      const rankTh = bodyTable.querySelector(
        'thead th.sticky-col-rank',
      ) as HTMLElement | null
      if (rankTh) {
        const rankW = Math.ceil(rankTh.getBoundingClientRect().width)
        bodyTable.style.setProperty('--sticky-rank-width', `${rankW}px`)
        headTable.style.setProperty('--sticky-rank-width', `${rankW}px`)
        footTable.style.setProperty('--sticky-rank-width', `${rankW}px`)
      }

      const countryTh = bodyTable.querySelector(
        'thead th.sticky-col-country',
      ) as HTMLElement | null
      const countryW = countryTh
        ? Math.ceil(countryTh.getBoundingClientRect().width)
        : 0
      bodyTable.style.setProperty('--sticky-country-width', `${countryW}px`)
      headTable.style.setProperty('--sticky-country-width', `${countryW}px`)
      footTable.style.setProperty('--sticky-country-width', `${countryW}px`)

      const r = bodyScroll.getBoundingClientRect()
      footScroll.style.marginLeft = `${Math.max(0, r.left)}px`
      footScroll.style.width = `${r.width}px`
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(bodyTable)
    ro.observe(bodyScroll)
    window.addEventListener('resize', sync)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', sync)
    }
  }, [
    rows,
    showCountry,
    visibleCols,
    columnOrder,
    loading,
    lang,
    sortKey,
    sortDir,
    countryLabelMode,
  ])

  // Pin Total row whenever the table is on screen (any row count).
  useEffect(() => {
    const table = tableRef.current
    if (!table) return

    const update = () => {
      const vv = window.visualViewport
      const vh = vv?.height ?? window.innerHeight
      const tableRect = table.getBoundingClientRect()
      const tableInView = tableRect.bottom > 80 && tableRect.top < vh - 40
      setPinTotal(tableInView)
    }

    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    const io = new IntersectionObserver(update, {
      root: null,
      threshold: [0, 0.01, 0.1, 1],
    })
    io.observe(table)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
      io.disconnect()
    }
  }, [rows, loading, showCountry, visibleCols, placeKind, countryLabelMode])

  const syncScroll = (source: 'head' | 'body' | 'foot') => {
    const head = headScrollRef.current
    const body = bodyScrollRef.current
    const foot = footScrollRef.current
    const shell = shellRef.current
    if (!head || !body || !foot || syncingScroll.current) return
    syncingScroll.current = true
    const left =
      source === 'body'
        ? body.scrollLeft
        : source === 'head'
          ? head.scrollLeft
          : foot.scrollLeft
    head.scrollLeft = left
    body.scrollLeft = left
    foot.scrollLeft = left
    const scrolled = left > 0
    shell?.classList.toggle('is-x-scrolled', scrolled)
    foot.closest('.total-pin')?.classList.toggle('is-x-scrolled', scrolled)
    requestAnimationFrame(() => {
      syncingScroll.current = false
    })
  }

  useHorizontalTouchScroll(
    bodyScrollRef,
    () => syncScroll('body'),
    [rows.length, shouldVirtualize, loading],
  )
  useHorizontalTouchScroll(
    headScrollRef,
    () => syncScroll('head'),
    [rows.length, shouldVirtualize, loading],
  )

  /** Folded display names that collide across Brazil municipalities in view. */
  // Must run before loading/empty early returns — otherwise React #310 when
  // Brazil cities finish loading and this hook suddenly appears.
  const duplicateBrazilCityNames = useMemo(() => {
    if (placeKind !== 'city') return new Set<string>()
    const counts = new Map<string, number>()
    for (const r of rows) {
      const parent = countries.get(r.countryId)
      if (!parent?.domestic) continue
      const key = foldForSearch(cityDisplayName(r, lang))
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const dups = new Set<string>()
    for (const [key, n] of counts) {
      if (n > 1) dups.add(key)
    }
    return dups
  }, [rows, placeKind, countries, lang])

  if (loading) {
    return (
      <p className="py-8 text-center text-[var(--ink-muted)]">
        {t(placeKind === 'suburb' ? 'suburbLoading' : 'cityLoading', lang)}
      </p>
    )
  }

  if (loadError && rows.length === 0 && placeKind === 'suburb') {
    return (
      <div className="space-y-3 py-8 text-center text-[var(--ink-muted)]">
        <p>{t('suburbLoadError', lang)}</p>
        {onRetryLoad ? (
          <button
            type="button"
            className="control px-3 py-1.5 text-sm font-semibold text-[var(--ink)]"
            onClick={onRetryLoad}
          >
            {t('suburbRetry', lang)}
          </button>
        ) : null}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-[var(--ink-muted)]">
        {t(
          placeKind === 'area'
            ? 'areaEmpty'
            : placeKind === 'suburb'
              ? 'suburbEmpty'
              : 'cityEmpty',
          lang,
        )}
      </p>
    )
  }

  const placeLabel = t(
    placeKind === 'area' ? 'area' : placeKind === 'suburb' ? 'suburb' : 'city',
    lang,
  )
  const placeHint = t(
    placeKind === 'area'
      ? 'hintArea'
      : placeKind === 'suburb'
        ? 'hintCity'
        : 'hintCity',
    lang,
  )
  const placeCountLabel = t(
    placeKind === 'area'
      ? 'areas'
      : placeKind === 'suburb'
        ? 'suburbs'
        : 'cities',
    lang,
  )

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  // When every visible row is the same country (e.g. Brazil focused), show
  // flag + abbrev in the Total row too — never drop the country column.
  const singleCountryId = rows[0]?.countryId
  const singleCountry =
    singleCountryId && rows.every((r) => r.countryId === singleCountryId)
      ? countries.get(singleCountryId) ?? null
      : null

  const totalCells = (
    <>
      <td className="sticky-col sticky-col-rank px-2 py-2.5 text-right tabular-nums text-[var(--ink-muted)]">
        —
      </td>
      {showCountry ? (
        <td
          className={`sticky-col sticky-col-country cell-truncate ${countryColClass} px-2 py-2.5 text-[var(--ink-muted)]`}
        >
          {singleCountry ? (
            <NameTip label={countryName(singleCountry, lang)}>
              <span className="country-flag-label">
                <CountryFlag iso3={singleCountry.iso3} />
                {!flagOnlyLabels ? (
                  <span className="cell-truncate-text">
                    {countryAbbrev(singleCountry, lang)}
                  </span>
                ) : null}
              </span>
            </NameTip>
          ) : (
            '—'
          )}
        </td>
      ) : null}
      <td className="sticky-col sticky-col-city cell-truncate cell-truncate-city px-2 py-2.5 text-[var(--ink)]">
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
              <td key={col} className="px-2 py-2.5 text-right tabular-nums">
                {fmtInt(totals.valid, lang)}
              </td>
            )
          case 'votes2022':
            return (
              <td key={col} className="px-2 py-2.5 text-right tabular-nums">
                {fmtInt(totals.valid2022, lang)}
              </td>
            )
          case 'lulaPct2026':
            return (
              <td key={col} className="px-2 py-2.5 text-right tabular-nums">
                {fmtShare(totals.lulaPct, totals.lula, lang, shareOpts)}
              </td>
            )
          case 'bolsonaroPct2026':
            return (
              <td key={col} className="px-2 py-2.5 text-right tabular-nums">
                {fmtShare(totals.bolsoPct, totals.bolsonaro, lang, shareOpts)}
              </td>
            )
          case 'lulaPct2022':
            return (
              <td
                key={col}
                className="px-2 py-2.5 text-right tabular-nums text-[var(--ink-muted)]"
              >
                {fmtShare(totals.lulaPct2022, totals.lula2022, lang, shareOpts)}
              </td>
            )
          case 'bolsonaroPct2022':
            return (
              <td
                key={col}
                className="px-2 py-2.5 text-right tabular-nums text-[var(--ink-muted)]"
              >
                {fmtShare(totals.bolsoPct2022, totals.bolso2022, lang, shareOpts)}
              </td>
            )
          case 'lulaChange':
            return (
              <td key={col} className="px-2 py-2.5 text-right tabular-nums">
                {fmtPpWithVotes(totals.lulaChange, totals.lulaVotesDelta, lang, shareOpts)}
              </td>
            )
          case 'bolsonaroChange':
            return (
              <td key={col} className="px-2 py-2.5 text-right tabular-nums">
                {fmtPpWithVotes(totals.bolsonaroChange, totals.bolsonaroVotesDelta, lang, shareOpts)}
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
                className="px-2 py-2.5 text-right tabular-nums text-[var(--ink-muted)]"
              >
                {fmtCoverage(totals.coverage)}
              </td>
            )
        }
      })}
      <td className="table-col-spacer" aria-hidden="true" />
    </>
  )

  const headerRow = (
    <tr className="border-b border-[var(--line)] text-xs uppercase tracking-wide text-[var(--ink-muted)]">
      <SortableTh align="right" stickyCol="rank">
        {t('rank', lang)}
      </SortableTh>
      {showCountry ? (
        <SortableTh
          onClick={() => onSort('country')}
          hint={flagOnlyLabels ? undefined : t('hintCountry', lang)}
          stickyCol="country"
          className={countryColClass}
        >
          {flagOnlyLabels ? (
            <span className="sr-only">{t('country', lang)}</span>
          ) : (
            t('country', lang)
          )}
          {arrow('country')}
        </SortableTh>
      ) : null}
      <SortableTh
        onClick={() => onSort('city')}
        hint={placeHint}
        stickyCol="city"
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
          case 'votes2022':
            return (
              <SortableTh
                key={col}
                align="right"
                hint={t('hintVotes2022', lang)}
                onClick={() => onSort('votes2022')}
                {...drag}
              >
                {t('votes2022', lang)}
                {arrow('votes2022')}
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
      <th className="table-col-spacer" aria-hidden="true" />
    </tr>
  )

  return (
    <div>
      <div className="results-table-shell" ref={shellRef}>
        {/* Sticky header under filter chrome (same pattern as Country table) */}
        <div className="table-head-sticky">
          <div
            className="table-x-scroll table-x-scroll--head"
            ref={headScrollRef}
            onScroll={() => syncScroll('head')}
          >
            <table
              ref={headTableRef}
              className={`results-table results-table--head results-table--cities ${tableKindClass} text-left text-sm`}
            >
              <thead>{headerRow}</thead>
            </table>
          </div>
        </div>

        <div
          className={
            shouldVirtualize ? 'table-y-scroll table-y-scroll--virtual' : undefined
          }
          ref={shouldVirtualize ? bodyYScrollRef : undefined}
        >
          <div
            className="table-x-scroll"
            ref={bodyScrollRef}
            onScroll={() => {
              syncScroll('body')
            }}
          >
          <table
            ref={tableRef}
            className={`results-table results-table--cities ${tableKindClass} text-left text-sm`}
          >
            <thead aria-hidden="true" className="results-table-width-head">
              {headerRow}
            </thead>
            <tbody>
            {paddingTop > 0 ? (
              <tr aria-hidden="true" className="virtual-pad-row">
                <td
                  colSpan={colCount}
                  style={{
                    height: paddingTop,
                    padding: 0,
                    border: 'none',
                  }}
                />
              </tr>
            ) : null}
            {(virtualItems
              ? virtualItems.map((vi) => ({ c: rows[vi.index], index: vi.index, key: vi.key }))
              : rows.map((c, index) => ({ c, index, key: `${c.countryId}-${c.code}` }))
            ).map(({ c, index, key }) => {
              const parent = countries.get(c.countryId)
              const fullCountry = parent
                ? countryName(parent, lang)
                : c.countryId
              const shortCountry = parent
                ? countryAbbrev(parent, lang)
                : c.countryId
              const fullPlace = cityDisplayName(c, lang)
              const cityUf =
                placeKind === 'city' && parent?.domestic
                  ? cityPlaceParentLabel(c, lang, { domestic: true })
                  : ''
              const disambiguateCity =
                Boolean(cityUf) &&
                duplicateBrazilCityNames.has(foldForSearch(fullPlace))
              const baseVisiblePlace = areaDisplayName(c, lang, {
                domestic: parent?.domestic,
                preferUf: preferBrazilUf,
              })
              // Homonymous municipalities (Campo Grande in MS/AL/RN): put UF
              // in the primary label so rows are not indistinguishable.
              const visiblePlace = disambiguateCity
                ? `${fullPlace} (${cityUf})`
                : baseVisiblePlace
              const showingUf = visiblePlace !== fullPlace
              const parentPlaceFull =
                placeKind === 'suburb'
                  ? placeParentLabel(c, lang)
                  : placeKind === 'city' && !disambiguateCity
                    ? cityPlaceParentLabel(c, lang, {
                        domestic: parent?.domestic,
                      })
                    : ''
              const parentPlace =
                placeKind === 'suburb'
                  ? areaUfCompact
                    ? placeParentLabelCompact(c, lang)
                    : parentPlaceFull
                  : parentPlaceFull
              // Keep UF visible on Bairro rows even when the long parent line
              // is compacted or truncated (prefix with UF · when missing).
              const suburbUf =
                placeKind === 'suburb' ? placeParentUf(c) : null
              const parentPlaceShown =
                placeKind === 'suburb' &&
                suburbUf &&
                parentPlace &&
                !parentPlace.toUpperCase().startsWith(`${suburbUf} ·`) &&
                parentPlace.toUpperCase() !== suburbUf
                  ? `${suburbUf} · ${parentPlace}`
                  : parentPlace
              const placeTip = parentPlaceFull
                ? `${fullPlace} · ${parentPlaceFull}`
                : disambiguateCity
                  ? `${fullPlace} (${cityUf})`
                  : fullPlace
              return (
                <tr
                  key={key}
                  data-index={index}
                  ref={
                    shouldVirtualize ? virtualizer.measureElement : undefined
                  }
                  className="border-b border-[var(--line-soft)] hover:bg-[var(--chip-soft)]"
                >
                  <td className="sticky-col sticky-col-rank px-2 py-2.5 text-right tabular-nums">
                    {index + 1}
                  </td>
                  {showCountry ? (
                    <td
                      className={`sticky-col sticky-col-country cell-truncate ${countryColClass} px-2 py-2.5`}
                    >
                      <NameTip label={fullCountry}>
                        <span className="country-flag-label">
                          {parent ? <CountryFlag iso3={parent.iso3} /> : null}
                          {!flagOnlyLabels || !parent ? (
                            <span className="cell-truncate-text">
                              {shortCountry}
                            </span>
                          ) : null}
                        </span>
                      </NameTip>
                    </td>
                  ) : null}
                  <td className="sticky-col sticky-col-city cell-truncate cell-truncate-city px-2 py-2.5">
                    <NameTip
                      label={placeTip}
                      when={
                        showingUf || parentPlaceShown ? 'always' : 'truncate'
                      }
                    >
                      <span className="cell-truncate-text">
                        {visiblePlace}
                        {parentPlaceShown ? (
                          <span className="place-parent-line mt-0.5 text-[10px] font-normal text-[var(--ink-muted)]">
                            {parentPlaceShown}
                          </span>
                        ) : null}
                      </span>
                    </NameTip>
                  </td>
                  {metricCols.map((col) => {
                    switch (col) {
                      case 'region':
                        return (
                          <td
                            key={col}
                            className="cell-truncate cell-truncate-sm px-2 py-2.5"
                          >
                            {parent ? (
                              <NameTip
                                label={regionLabel(parent.region, lang)}
                                when="truncate"
                              >
                                <span className="cell-truncate-text">
                                  {regionLabel(parent.region, lang)}
                                </span>
                              </NameTip>
                            ) : (
                              '—'
                            )}
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
                      case 'votes2022':
                        return (
                          <td
                            key={col}
                            className="px-2 py-2.5 text-right tabular-nums"
                          >
                            {fmtInt(c.y2022?.totalValid, lang)}
                          </td>
                        )
                      case 'lulaPct2026':
                        return (
                          <td
                            key={col}
                            className="px-2 py-2.5 text-right tabular-nums"
                          >
                            {fmtShare(c.y2026.lulaPct, c.y2026.lula, lang, shareOpts)}
                          </td>
                        )
                      case 'bolsonaroPct2026':
                        return (
                          <td
                            key={col}
                            className="px-2 py-2.5 text-right tabular-nums"
                          >
                            {fmtShare(c.y2026.bolsonaroPct, c.y2026.bolsonaro, lang, shareOpts)}
                          </td>
                        )
                      case 'lulaPct2022':
                        return (
                          <td
                            key={col}
                            className="px-2 py-2.5 text-right tabular-nums"
                          >
                            {fmtShare(c.y2022?.lulaPct, c.y2022?.lula, lang, shareOpts)}
                          </td>
                        )
                      case 'bolsonaroPct2022':
                        return (
                          <td
                            key={col}
                            className="px-2 py-2.5 text-right tabular-nums"
                          >
                            {fmtShare(c.y2022?.bolsonaroPct, c.y2022?.bolsonaro, lang, shareOpts)}
                          </td>
                        )
                      case 'lulaChange':
                        return (
                          <td
                            key={col}
                            className="px-2 py-2.5 text-right tabular-nums"
                          >
                            {fmtPpWithVotes(cityLulaChange(c), cityLulaVotesDelta(c), lang, shareOpts)}
                          </td>
                        )
                      case 'bolsonaroChange':
                        return (
                          <td
                            key={col}
                            className="px-2 py-2.5 text-right tabular-nums"
                          >
                            {fmtPpWithVotes(cityBolsonaroChange(c), cityBolsonaroVotesDelta(c), lang, shareOpts)}
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
                            className="px-2 py-2.5 text-right tabular-nums"
                          >
                            {fmtCoverage(c.coverage)}
                          </td>
                        )
                    }
                  })}
                  <td className="table-col-spacer" aria-hidden="true" />
                </tr>
              )
            })}
            {paddingBottom > 0 ? (
              <tr aria-hidden="true" className="virtual-pad-row">
                <td
                  colSpan={colCount}
                  style={{
                    height: paddingBottom,
                    padding: 0,
                    border: 'none',
                  }}
                />
              </tr>
            ) : null}
          </tbody>
          <tfoot className="results-table-width-foot" aria-hidden="true">
            <tr className="text-sm font-semibold">{totalCells}</tr>
          </tfoot>
        </table>
          </div>
        </div>
      </div>

      {/* Fixed Total row — same columns/widths as the table */}
      <div
        ref={totalPinRef}
        className={`total-pin total-pin--row ${pinTotal ? 'total-pin--on' : ''}`}
        aria-hidden={!pinTotal}
      >
        <div
          className="table-x-scroll table-x-scroll--foot"
          ref={footScrollRef}
          onScroll={() => syncScroll('foot')}
        >
          <table
            ref={footTableRef}
            className={`results-table results-table--foot results-table--cities ${tableKindClass} text-left text-sm`}
          >
            <tbody>
              <tr className="text-sm font-semibold">{totalCells}</tr>
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-2 px-1 text-xs text-[var(--ink-muted)]">
        {footerNote ?? t('cityNo2022Footnote', lang)}
      </p>
    </div>
  )
}
