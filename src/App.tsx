import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import rawRound1 from './data/results.json'
import rawRound2 from './data/results-runoff.json'
import { CityBreakdownTable } from './components/CityBreakdownTable'
import { MultiSelectFilter } from './components/MultiSelectFilter'
import { ResultsTable } from './components/ResultsTable'
import { TableColumnPicker } from './components/TableColumnPicker'
import { WorldMap } from './components/WorldMap'
import {
  noValidVotePct,
  noValidVotes,
  aggregateRows,
  countryName,
  fmtInt,
  fmtPct,
  fmtPp,
  otherPct,
  runningTotals,
} from './lib/format'
import {
  parentFocus,
  tableViewForFocus,
  ufFromCityCode,
  type MapFocus,
  type MapPick,
} from './lib/brazilGeo'
import {
  compareCityRows,
  groupSuburbRowsByNeighborhood,
  taggedAreaRows,
  taggedBrazilCityRows,
  taggedBreakdownRows,
  taggedSuburbRows,
} from './lib/cityRows'
import {
  areaFilterOptions,
  cityFilterOptions,
  countryFilterOptions,
  countryIdsFromPlaceKeys,
  parsePlaceFilterKey,
  placeFilterKey,
  pruneCityKeysToAreas,
  prunePlaceKeysToCountries,
  rowMatchesAreaFilter,
  rowMatchesCityFilter,
  rowMatchesCountryFilter,
} from './lib/geoFilters'
import { metricLabel, regionLabel, t } from './lib/i18n'
import { collatorFor } from './lib/collator'
import { searchIncludes } from './lib/searchText'
import { prefetchBrazilMunicipalityMesh } from './lib/brazilGeo'
import {
  prefetchBrazilCities,
  prefetchBrazilCitiesHandler,
  prefetchBrazilSuburbs,
  prefetchBrazilSuburbsHandler,
  useBrazilDomestic,
} from './lib/useBrazilDomestic'
import { prefetchBrazilLocais } from './lib/brazilLocais'
import { useBrazilLocais } from './lib/useBrazilLocais'
import type { BrazilLocalRow } from './lib/brazilLocais'

const BRAZIL_ID = 'brazil'
import { isPressOnlyWindow } from './lib/electionRound'
import { mergeRounds } from './lib/mergeRounds'
import {
  moveColumn,
  readStoredColumnOrder,
  readStoredTableCols,
  writeStoredColumnOrder,
  writeStoredTableCols,
  type TableMetricCol,
} from './lib/tableColumns'
import {
  buildShareUrl,
  copyTextToClipboard,
  parseShareSearch,
  type ShareViewState,
  type TableView,
} from './lib/shareUrl'
import { useTheme } from './lib/theme'
import {
  COUNTRY_FLAG_ONLY_MQ,
  useMediaQuery,
} from './lib/useMediaQuery'
import { autoRefreshLabel, useResultsData } from './lib/useResultsData'
import type { CountryResult, Lang, MapMetric, ResultsData, SortKey } from './types'
import { HEATMAP_METRICS } from './types'

function readInitialShare() {
  if (typeof window === 'undefined') return parseShareSearch('')
  return parseShareSearch(window.location.search)
}

const seedRound1 = rawRound1 as ResultsData
const seedRound2 = rawRound2 as ResultsData
const unifiedSeed = mergeRounds(seedRound2, seedRound1)

const LANG_KEY = 'eleicoes-exterior-lang'

function readStoredLang(): Lang {
  try {
    const stored = localStorage.getItem(LANG_KEY)
    if (stored === 'en' || stored === 'pt') return stored
  } catch {
    /* ignore */
  }
  return 'pt'
}

function brazilHasCityData(c: CountryResult | null | undefined): boolean {
  if (!c) return false
  return (c.cities?.length ?? 0) > 0 || (c.cityCount ?? 0) > 0
}

function brazilHasSuburbData(c: CountryResult | null | undefined): boolean {
  if (!c) return false
  return (c.suburbs?.length ?? 0) > 0 || (c.suburbCount ?? 0) > 0
}

/** Bypass HTTP / Cache API caches — useful on iOS where Cmd/Ctrl+Shift+R is unavailable. */
async function hardRefresh(): Promise<void> {
  try {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
    }
  } catch {
    /* ignore */
  }
  try {
    await fetch(window.location.href, {
      cache: 'reload',
      credentials: 'same-origin',
    })
  } catch {
    /* ignore */
  }
  window.location.reload()
}

export default function App() {
  const { theme, toggleTheme, setTheme } = useTheme()
  const [initialShare] = useState(readInitialShare)
  const [shareFeedback, setShareFeedback] = useState<'copied' | 'failed' | null>(
    null,
  )
  const { data: liveData, syncStatus, live } = useResultsData(unifiedSeed, '2')
  const seedData = useMemo(
    () => mergeRounds(liveData, seedRound1),
    [liveData],
  )
  const any2026Reported = useMemo(
    () =>
      seedData.countries.some(
        (c) => !c.domestic && c.status === 'reported' && c.y2026,
      ),
    [seedData],
  )
  const [lang, setLangState] = useState<Lang>(() => {
    if (initialShare.lang) return initialShare.lang
    return typeof window === 'undefined' ? 'pt' : readStoredLang()
  })
  const setLang = (next: Lang) => {
    setLangState(next)
    try {
      localStorage.setItem(LANG_KEY, next)
    } catch {
      /* ignore */
    }
  }
  const [query, setQuery] = useState(() => initialShare.query ?? '')
  /** Keep typing snappy while large Brazil tables filter/sort. */
  const deferredQuery = useDeferredValue(query)
  const [region, setRegion] = useState(() => initialShare.region ?? 'all')
  const [statusFilter, setStatusFilter] = useState<'reported' | 'all' | 'pending'>(
    () => {
      if (initialShare.status) return initialShare.status
      // Until 2026 runoff BUs/TSE land, default to All so 2022 history shows.
      return any2026Reported ? 'reported' : 'all'
    },
  )
  /** Multi-select geo filters above the table (cascading country → area → city). */
  const [selectedCountryIds, setSelectedCountryIds] = useState<string[]>(
    () => initialShare.countries ?? [],
  )
  const [selectedAreaKeys, setSelectedAreaKeys] = useState<string[]>(
    () => initialShare.areas ?? [],
  )
  const [selectedCityKeys, setSelectedCityKeys] = useState<string[]>(
    () => initialShare.cities ?? [],
  )
  // Latest picks for tab switches — avoids stale closures wiping Australia→Brazil.
  const selectedCountryIdsRef = useRef(selectedCountryIds)
  selectedCountryIdsRef.current = selectedCountryIds
  const selectedAreaKeysRef = useRef(selectedAreaKeys)
  selectedAreaKeysRef.current = selectedAreaKeys
  const selectedCityKeysRef = useRef(selectedCityKeys)
  selectedCityKeysRef.current = selectedCityKeys
  const [metric, setMetric] = useState<MapMetric>(
    () => initialShare.metric ?? 'roundSwing',
  )
  const [sortKey, setSortKey] = useState<SortKey>(
    () => initialShare.sortKey ?? 'votes2026',
  )
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(
    () => initialShare.sortDir ?? 'desc',
  )
  const [highlightId, setHighlightId] = useState<string | null>(
    () => initialShare.highlightId ?? null,
  )
  /** World → Brazil UFs → municipalities → neighborhoods. */
  const [mapFocus, setMapFocus] = useState<MapFocus>(
    () => initialShare.mapFocus ?? { level: 'world' },
  )
  /** Domestic Brazil is hidden from tables until toggled or selected on the map. */
  const [includeBrazil, setIncludeBrazil] = useState(
    () => initialShare.includeBrazil ?? false,
  )
  const [tableView, setTableView] = useState<TableView>(
    () => initialShare.tableView ?? 'countries',
  )
  const wantBrazil =
    includeBrazil ||
    highlightId === BRAZIL_ID ||
    mapFocus.level !== 'world'
  // Lazy Brazil city/suburb grain for runoff (`brazil-*-runoff.json` when present).
  const brazilDomestic = useBrazilDomestic({
    round: '2',
    wantCities: wantBrazil,
    wantSuburbs:
      wantBrazil &&
      (tableView === 'suburbs' ||
        tableView === 'locais' ||
        mapFocus.level === 'city'),
  })
  // Nexo-style voting-place points (local de votação ≈ aggregated BUs).
  const brazilLocais = useBrazilLocais({
    enabled: wantBrazil && tableView === 'locais',
    round: '2',
    uf: mapFocus.level === 'uf' || mapFocus.level === 'city' ? mapFocus.uf : null,
  })

  const data = useMemo(() => {
    const cities = brazilDomestic.cities?.length ? brazilDomestic.cities : null
    const suburbs = brazilDomestic.suburbs?.length
      ? brazilDomestic.suburbs
      : null
    if (!cities && !suburbs) return seedData
    return {
      ...seedData,
      countries: seedData.countries.map((c) =>
        c.id === BRAZIL_ID
          ? {
              ...c,
              cities: cities ?? c.cities,
              cityCount: cities?.length ?? c.cityCount ?? c.cities?.length,
              suburbs: suburbs ?? c.suburbs,
              suburbCount:
                suburbs?.length ?? c.suburbCount ?? c.suburbs?.length,
            }
          : c,
      ),
    }
  }, [seedData, brazilDomestic.cities, brazilDomestic.suburbs])
  const [visibleCols, setVisibleCols] = useState<TableMetricCol[]>(() => {
    if (initialShare.visibleCols) return initialShare.visibleCols
    return readStoredTableCols()
  })
  const [columnOrder, setColumnOrder] = useState<TableMetricCol[]>(() => {
    if (initialShare.columnOrder) return initialShare.columnOrder
    return readStoredColumnOrder()
  })

  useEffect(() => {
    if (initialShare.theme) setTheme(initialShare.theme)
    // Apply once from the shared link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Flip status to Reported once the first 2026 runoff overseas tally lands.
  useEffect(() => {
    if (initialShare.status) return
    if (any2026Reported) setStatusFilter('reported')
  }, [any2026Reported, initialShare.status])

  const mapMetrics = HEATMAP_METRICS
  const tableChromeRef = useRef<HTMLDivElement>(null)
  /** Phones: filters scroll with the page (not sticky). */
  const filtersUnsticky = useMediaQuery(COUNTRY_FLAG_ONLY_MQ)

  function setVisibleColsPersist(next: TableMetricCol[]) {
    setVisibleCols(next)
    writeStoredTableCols(next)
  }

  function reorderColumns(from: TableMetricCol, to: TableMetricCol) {
    setColumnOrder((prev) => {
      const next = moveColumn(prev, from, to)
      writeStoredColumnOrder(next)
      return next
    })
  }

  useEffect(() => {
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en'
    document.title = t('brand', lang)
  }, [lang])

  useEffect(() => {
    if (!shareFeedback) return
    const id = window.setTimeout(() => setShareFeedback(null), 2000)
    return () => window.clearTimeout(id)
  }, [shareFeedback])

  async function handleShare() {
    const snapshot: ShareViewState = {
      round: '2',
      lang,
      theme,
      query,
      region,
      status: statusFilter,
      countries: selectedCountryIds,
      areas: selectedAreaKeys,
      cities: selectedCityKeys,
      metric,
      sortKey,
      sortDir,
      highlightId,
      mapFocus,
      includeBrazil,
      tableView,
      visibleCols,
      columnOrder,
    }
    const url = buildShareUrl(snapshot)
    const ok = await copyTextToClipboard(url)
    setShareFeedback(ok ? 'copied' : 'failed')
    if (ok) {
      try {
        window.history.replaceState(null, '', url)
      } catch {
        /* ignore */
      }
    }
  }

  useEffect(() => {
    const el = tableChromeRef.current
    if (!el) return
    const syncHeadOffset = () => {
      // Mobile: chrome scrolls away — table headers stick to the viewport top.
      if (filtersUnsticky) {
        el.style.removeProperty('--sticky-chrome-height')
        document.documentElement.style.setProperty(
          '--sticky-table-head-top',
          '0px',
        )
        return
      }
      const height = Math.ceil(
        (el.querySelector('.sticky-table-chrome-inner') as HTMLElement | null)
          ?.scrollHeight ?? el.scrollHeight,
      )
      const style = getComputedStyle(el)
      const padY =
        (parseFloat(style.paddingTop) || 0) +
        (parseFloat(style.paddingBottom) || 0)
      const full = Math.ceil(height + padY)
      el.style.setProperty('--sticky-chrome-height', `${full}px`)
      document.documentElement.style.setProperty(
        '--sticky-table-head-top',
        `${full}px`,
      )
    }
    syncHeadOffset()
    const ro = new ResizeObserver(syncHeadOffset)
    ro.observe(el)
    const inner = el.querySelector('.sticky-table-chrome-inner')
    if (inner) ro.observe(inner)
    window.addEventListener('resize', syncHeadOffset)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', syncHeadOffset)
    }
  }, [filtersUnsticky])

  const brazilCountry = useMemo(
    () => data.countries.find((c) => c.id === BRAZIL_ID) ?? null,
    [data.countries],
  )
  const showBrazilInTables =
    includeBrazil || highlightId === BRAZIL_ID || mapFocus.level !== 'world'
  const showSuburbTab = Boolean(
    showBrazilInTables &&
      (brazilHasSuburbData(brazilCountry) || brazilDomestic.suburbsLoading),
  )
  /** Nexo-style voting-place map (2º turno locais / aggregated BUs). */
  const showLocalTab = showBrazilInTables

  const regions = useMemo(
    () =>
      [
        ...new Set(
          data.countries
            .filter((c) => showBrazilInTables || !c.domestic)
            .map((c) => c.region),
        ),
      ].sort(),
    [data.countries, showBrazilInTables],
  )

  const totals = useMemo(
    () => runningTotals(data.countries, { includeDomestic: includeBrazil }),
    [data.countries, includeBrazil],
  )
  const reportedCountries = useMemo(
    () => data.countries.filter((c) => c.status === 'reported'),
    [data.countries],
  )
  /** Header aggregate cards follow Incluir Brasil (overseas-only by default). */
  const reportedForHeader = useMemo(
    () =>
      reportedCountries.filter((c) => includeBrazil || !c.domestic),
    [reportedCountries, includeBrazil],
  )
  const reportedAgg = useMemo(
    () => aggregateRows(reportedForHeader),
    [reportedForHeader],
  )
  const reportedCount = reportedForHeader.filter((c) => !c.domestic).length
  const headerCountryDenom = useMemo(() => {
    const overseas = data.countries.filter((c) => !c.domestic).length
    return includeBrazil ? overseas + 1 : overseas
  }, [data.countries, includeBrazil])
  const hist2022OverseasCount = useMemo(
    () =>
      data.countries.filter(
        (c) => !c.domestic && c.y2022 && c.y2022.totalValid > 0,
      ).length,
    [data.countries],
  )

  function setIncludeBrazilSynced(on: boolean) {
    if (on) {
      prefetchBrazilCities()
      prefetchBrazilMunicipalityMesh()
    }
    startTransition(() => setIncludeBrazil(on))
    if (!on && mapFocus.level !== 'world') {
      setMapFocus({ level: 'world' })
      setTableView('countries')
    }
    if (!on && highlightId === BRAZIL_ID) {
      setHighlightId(null)
    }
    if (!on && selectedCountryIds.includes(BRAZIL_ID)) {
      onCountryFilterChange(
        selectedCountryIds.filter((id) => id !== BRAZIL_ID),
      )
    }
  }

  /**
   * Map must include pending countries that already have 2022 or 1º history —
   * otherwise the map looks empty until the first 2026 runoff BU lands,
   * even when coloring by Leader 2022 / 1st-round metrics.
   */
  const mapCountries = useMemo(() => {
    return data.countries.filter((c) => {
      if (c.domestic && !showBrazilInTables) return false
      if (c.status === 'reported' && c.y2026) return true
      if (c.y2022 && c.y2022.totalValid > 0) return true
      if (c.yRound1 && c.yRound1.totalValid > 0) return true
      if (c.y2022Round1 && c.y2022Round1.totalValid > 0) return true
      return false
    })
  }, [data.countries, showBrazilInTables])

  const filtered = useMemo(() => {
    const q = deferredQuery.trim()
    // Area/city picks also constrain the Country tab to matching countries.
    const placeCountryIds = countryIdsFromPlaceKeys([
      ...selectedAreaKeys,
      ...selectedCityKeys,
    ])
    return data.countries.filter((c) => {
      if (c.domestic && !showBrazilInTables) return false
      if (statusFilter === 'reported' && c.status !== 'reported') return false
      if (statusFilter === 'pending' && c.status !== 'pending') return false
      if (region !== 'all' && c.region !== region) return false
      if (!rowMatchesCountryFilter(c.id, selectedCountryIds)) return false
      if (
        placeCountryIds.length > 0 &&
        !placeCountryIds.includes(c.id)
      ) {
        return false
      }
      if (!q) return true
      return (
        searchIncludes(c.countryEn, q) ||
        searchIncludes(c.countryPt, q) ||
        searchIncludes(c.iso3, q) ||
        searchIncludes(c.abbrevEn, q) ||
        searchIncludes(c.abbrevPt, q)
      )
    })
  }, [
    data.countries,
    deferredQuery,
    region,
    statusFilter,
    showBrazilInTables,
    selectedCountryIds,
    selectedAreaKeys,
    selectedCityKeys,
  ])

  const sorted = useMemo(() => {
    const rows = [...filtered]
    const dir = sortDir === 'asc' ? 1 : -1
    rows.sort((a, b) => compare(a, b, sortKey, lang) * dir)
    return rows
  }, [filtered, sortKey, sortDir, lang])

  function onSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(
        key === 'country' || key === 'region' || key === 'city' ? 'asc' : 'desc',
      )
    }
  }

  function switchTableView(next: TableView) {
    setTableView(next)
    if (next === 'countries' && sortKey === 'city') {
      setSortKey('votes2026')
      setSortDir('desc')
    }
    // Preserve country / Incluir Brasil state across Country → Area / City /
    // Bairro. Never auto-check Incluir Brasil or force a Brazil country filter.
    // Same rules for 1º turno and runoff — filter state is shared.
    // Read from refs so a just-committed PAÍS pick is never wiped by a stale
    // closure when the user taps Bairro/Cidade immediately after selecting.
    const countryIds = selectedCountryIdsRef.current
    const areaKeys = selectedAreaKeysRef.current
    const cityKeys = selectedCityKeysRef.current
    const hasCountryFilter = countryIds.length > 0
    const brazilInFilter =
      !hasCountryFilter || countryIds.includes(BRAZIL_ID)

    // City / Bairro: prefetch Brazil grain when Brazil is already in scope.
    // Do not auto-check Incluir Brasil or force a Brazil country filter —
    // overseas-only Area/City views should stay overseas-only.
    if (next === 'cities' || next === 'suburbs' || next === 'locais') {
      if (brazilInFilter && (includeBrazil || hasCountryFilter)) {
        prefetchBrazilCities()
        if (next === 'suburbs') prefetchBrazilSuburbs()
        if (next === 'locais') prefetchBrazilLocais('2')
      }

      if (brazilInFilter && (includeBrazil || countryIds.includes(BRAZIL_ID))) {
        if (next === 'suburbs' && cityKeys.length === 1) {
          const parsed = parsePlaceFilterKey(cityKeys[0])
          const cityCode = parsed?.code
          const uf = cityCode ? ufFromCityCode(cityCode) : null
          if (cityCode && uf) {
            setMapFocus({ level: 'city', uf, cityCode })
            setHighlightId(cityCode)
            return
          }
        }
        if (areaKeys.length === 1) {
          const parsed = parsePlaceFilterKey(areaKeys[0])
          const uf = parsed?.code
          if (uf && /^[A-Z]{2}$/.test(uf)) {
            setMapFocus({ level: 'uf', uf })
            setHighlightId(uf)
            return
          }
        }
        if (mapFocus.level === 'world' || mapFocus.level === 'brazil') {
          setMapFocus({ level: 'brazil' })
        }
        // Keep uf/city drill if the user already zoomed the map.
      }
    }
    if (next === 'areas') {
      if (brazilInFilter && (includeBrazil || countryIds.includes(BRAZIL_ID))) {
        prefetchBrazilCities()
        if (mapFocus.level === 'world') {
          setMapFocus({ level: 'brazil' })
          setHighlightId(BRAZIL_ID)
        } else if (mapFocus.level === 'city') {
          setMapFocus({ level: 'uf', uf: mapFocus.uf })
          setHighlightId(mapFocus.uf)
        }
      }
    }
    if (next === 'countries' && mapFocus.level !== 'world') {
      // Match mapBack / world background: leaving a Brazil (or other) drill
      // for the Country tab must not keep a hidden country filter that still
      // empties the table while the control reads "Any country".
      setMapFocus({ level: 'world' })
      setHighlightId(null)
      clearGeoFilters()
    }
  }

  function clearSearch() {
    setQuery('')
    setHighlightId(null)
  }

  function clearGeoFilters() {
    setSelectedCountryIds([])
    setSelectedAreaKeys([])
    setSelectedCityKeys([])
  }

  function applyCountryFilter(id: string) {
    setSelectedCountryIds([id])
    setSelectedAreaKeys((prev) => prunePlaceKeysToCountries(prev, [id]))
    setSelectedCityKeys((prev) => prunePlaceKeysToCountries(prev, [id]))
  }

  function onCountryFilterChange(next: string[]) {
    setSelectedCountryIds(next)
    setSelectedAreaKeys((prev) => prunePlaceKeysToCountries(prev, next))
    setSelectedCityKeys((prev) => prunePlaceKeysToCountries(prev, next))
    // Keep map highlight in sync when the country filter is a single country.
    if (next.length === 1) {
      setHighlightId(next[0])
      if (next[0] === BRAZIL_ID) setIncludeBrazil(true)
    } else if (highlightId && !next.includes(highlightId)) {
      setHighlightId(null)
    }
  }

  const countryById = useMemo(
    () => new Map(data.countries.map((c) => [c.id, c])),
    [data.countries],
  )

  function onAreaFilterChange(next: string[]) {
    setSelectedAreaKeys(next)
    setSelectedCityKeys((prev) => pruneCityKeysToAreas(prev, next, countryById))
  }

  function syncTabToFocus(focus: MapFocus) {
    // Zooming out to Brazil while on City/Bairro/Local keeps that tab — the
    // map shows the matching national grain instead of forcing Área.
    if (
      focus.level === 'brazil' &&
      (tableView === 'cities' ||
        tableView === 'suburbs' ||
        tableView === 'locais')
    ) {
      return
    }
    // Locais tab owns the Nexo-style point map at every Brazil drill level.
    if (tableView === 'locais' && focus.level !== 'world') {
      return
    }
    const next = tableViewForFocus(focus)
    setTableView(next)
    if (next === 'countries' && sortKey === 'city') {
      setSortKey('votes2026')
      setSortDir('desc')
    }
  }

  function mapBack() {
    const next = parentFocus(mapFocus)
    setMapFocus(next)
    syncTabToFocus(next)
    if (next.level === 'world') {
      setHighlightId(null)
      setQuery('')
      clearGeoFilters()
      return
    }
    if (next.level === 'brazil') {
      setHighlightId(BRAZIL_ID)
      applyCountryFilter(BRAZIL_ID)
      setSelectedAreaKeys([])
      setSelectedCityKeys([])
      return
    }
    if (next.level === 'uf') {
      setHighlightId(next.uf)
      applyCountryFilter(BRAZIL_ID)
      setSelectedAreaKeys([placeFilterKey(BRAZIL_ID, next.uf)])
      setSelectedCityKeys([])
    }
  }

  function onMapPick(pick: MapPick) {
    if (pick.kind === 'background') {
      if (mapFocus.level !== 'world') {
        mapBack()
        return
      }
      // Clear country focus on the world map.
      setHighlightId(null)
      setQuery('')
      clearGeoFilters()
      setTableView('countries')
      if (sortKey === 'city') {
        setSortKey('votes2026')
        setSortDir('desc')
      }
      return
    }

    if (pick.kind === 'country') {
      const country = data.countries.find((c) => c.id === pick.id)
      if (country?.domestic) {
        setIncludeBrazil(true)
        prefetchBrazilCities()
        setHighlightId(BRAZIL_ID)
        applyCountryFilter(BRAZIL_ID)
        const next: MapFocus = { level: 'brazil' }
        setMapFocus(next)
        // Area tab (UFs) — stay on the map; do not force-scroll to the table.
        syncTabToFocus(next)
        return
      }
      setHighlightId(pick.id)
      applyCountryFilter(pick.id)
      const hasBreakdown =
        !!country &&
        ((country.areas?.length ?? 0) > 0 || (country.cities?.length ?? 0) > 0)
      if (hasBreakdown && country) {
        setTableView('cities')
        window.setTimeout(() => {
          tableChromeRef.current?.scrollIntoView({
            block: 'start',
            behavior: 'smooth',
          })
        }, 0)
        return
      }
      document.getElementById(`row-${pick.id}`)?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      })
      return
    }

    if (pick.kind === 'uf') {
      setIncludeBrazil(true)
      prefetchBrazilCities()
      if (tableView === 'locais') prefetchBrazilLocais('2')
      setHighlightId(pick.uf)
      applyCountryFilter(BRAZIL_ID)
      setSelectedAreaKeys([placeFilterKey(BRAZIL_ID, pick.uf)])
      setSelectedCityKeys([])
      const next: MapFocus = { level: 'uf', uf: pick.uf }
      setMapFocus(next)
      syncTabToFocus(next)
      return
    }

    if (pick.kind === 'city') {
      setIncludeBrazil(true)
      prefetchBrazilCities()
      prefetchBrazilSuburbs()
      if (tableView === 'locais') prefetchBrazilLocais('2')
      setHighlightId(pick.cityCode)
      applyCountryFilter(BRAZIL_ID)
      setSelectedAreaKeys([placeFilterKey(BRAZIL_ID, pick.uf)])
      setSelectedCityKeys([placeFilterKey(BRAZIL_ID, pick.cityCode)])
      const next: MapFocus = {
        level: 'city',
        uf: pick.uf,
        cityCode: pick.cityCode,
      }
      setMapFocus(next)
      // Stay on Locais when drilling the Nexo-style point map.
      if (tableView !== 'locais') syncTabToFocus(next)
      return
    }

    if (pick.kind === 'suburb') {
      setHighlightId(pick.suburbCode)
    }
  }

  /** Country-table row click (may still scroll to the table chrome). */
  function onSelect(id: string | null) {
    if (!id) {
      setHighlightId(null)
      setQuery('')
      clearGeoFilters()
      setMapFocus({ level: 'world' })
      setTableView('countries')
      if (sortKey === 'city') {
        setSortKey('votes2026')
        setSortDir('desc')
      }
      return
    }
    const country = data.countries.find((c) => c.id === id)
    if (country?.domestic) {
      setIncludeBrazil(true)
      prefetchBrazilCities()
      setHighlightId(BRAZIL_ID)
      applyCountryFilter(BRAZIL_ID)
      const next: MapFocus = { level: 'brazil' }
      setMapFocus(next)
      syncTabToFocus(next)
      return
    }
    setHighlightId(id)
    applyCountryFilter(id)
    const hasBreakdown =
      !!country &&
      ((country.areas?.length ?? 0) > 0 || (country.cities?.length ?? 0) > 0)
    if (hasBreakdown && country) {
      setTableView('cities')
      window.setTimeout(() => {
        tableChromeRef.current?.scrollIntoView({
          block: 'start',
          behavior: 'smooth',
        })
      }, 0)
      return
    }
    document.getElementById(`row-${id}`)?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    })
  }

  const citySourceCountries = useMemo(() => {
    return data.countries.filter((c) => {
      if (c.domestic && !showBrazilInTables) return false
      if (
        (c.areas?.length ?? 0) === 0 &&
        !brazilHasCityData(c) &&
        !brazilHasSuburbData(c) &&
        (c.cities?.length ?? 0) === 0
      ) {
        return false
      }
      // Explicit country picks (e.g. Area-tab Brazil) stay available even when
      // Status would hide them — otherwise place tables go empty under Reported.
      const explicitlySelected =
        selectedCountryIds.length > 0 && selectedCountryIds.includes(c.id)
      if (!explicitlySelected) {
        if (statusFilter === 'reported' && c.status !== 'reported') return false
        if (statusFilter === 'pending' && c.status !== 'pending') return false
      }
      if (region !== 'all' && c.region !== region) return false
      if (!rowMatchesCountryFilter(c.id, selectedCountryIds)) return false
      return true
    })
  }, [
    data.countries,
    statusFilter,
    region,
    showBrazilInTables,
    selectedCountryIds,
  ])

  /** Countries available in the Country filter (region/status/Brazil visibility). */
  const filterableCountries = useMemo(() => {
    return data.countries.filter((c) => {
      if (c.domestic && !showBrazilInTables) return false
      if (statusFilter === 'reported' && c.status !== 'reported') return false
      if (statusFilter === 'pending' && c.status !== 'pending') return false
      if (region !== 'all' && c.region !== region) return false
      return true
    })
  }, [data.countries, statusFilter, region, showBrazilInTables])

  const countryOptions = useMemo(() => {
    // Keep currently selected countries in the menu even when status/region
    // would hide them — otherwise the trigger falls back to "Any country"
    // while the table is still filtered to e.g. pending Brazil.
    const byId = new Map(filterableCountries.map((c) => [c.id, c]))
    for (const id of selectedCountryIds) {
      if (byId.has(id)) continue
      const c = data.countries.find((row) => row.id === id)
      if (c) byId.set(id, c)
    }
    return countryFilterOptions([...byId.values()], lang)
  }, [filterableCountries, selectedCountryIds, data.countries, lang])

  // Country + world: drop picks that status/region hide (common after Area/City
  // auto-selected Brazil while Status is Reported). Otherwise the table stays
  // empty while the control can still look like "Any country".
  useEffect(() => {
    if (tableView !== 'countries') return
    if (mapFocus.level !== 'world') return
    if (selectedCountryIds.length === 0) return
    const allowed = new Set(filterableCountries.map((c) => c.id))
    const next = selectedCountryIds.filter((id) => allowed.has(id))
    if (next.length === selectedCountryIds.length) return
    setSelectedCountryIds(next)
    setSelectedAreaKeys((prev) => prunePlaceKeysToCountries(prev, next))
    setSelectedCityKeys((prev) => prunePlaceKeysToCountries(prev, next))
  }, [
    tableView,
    mapFocus.level,
    filterableCountries,
    selectedCountryIds,
  ])

  const areaSourceCountries = useMemo(() => {
    if (selectedCountryIds.length === 0) return filterableCountries
    const byId = new Map(
      filterableCountries
        .filter((c) => selectedCountryIds.includes(c.id))
        .map((c) => [c.id, c]),
    )
    // Area/City tabs may keep a country pick that Status currently hides
    // (Brazil pending + Reported) — still need its places in the menus.
    for (const id of selectedCountryIds) {
      if (byId.has(id)) continue
      const c = data.countries.find((row) => row.id === id)
      if (!c) continue
      if (c.domestic && !showBrazilInTables) continue
      byId.set(id, c)
    }
    return [...byId.values()]
  }, [
    filterableCountries,
    selectedCountryIds,
    data.countries,
    showBrazilInTables,
  ])

  const areaOptions = useMemo(
    () => areaFilterOptions(areaSourceCountries, lang),
    [areaSourceCountries, lang],
  )

  const cityOptions = useMemo(
    () => cityFilterOptions(areaSourceCountries, lang, selectedAreaKeys),
    [areaSourceCountries, lang, selectedAreaKeys],
  )

  const selectedCountLabel = (count: number) =>
    `${count} ${t('filterSelected', lang)}`

  const matchesPlaceQuery = (
    r: {
      name: string
      nameEn?: string
      namePt?: string
      area?: string
      areaEn?: string
      areaPt?: string
      countryId: string
    },
    q: string,
  ) => {
    if (!q) return true
    const parent = countryById.get(r.countryId)
    return (
      searchIncludes(r.name, q) ||
      searchIncludes(r.nameEn || '', q) ||
      searchIncludes(r.namePt || '', q) ||
      searchIncludes(r.area || '', q) ||
      searchIncludes(r.areaEn || '', q) ||
      searchIncludes(r.areaPt || '', q) ||
      Boolean(
        parent &&
          (searchIncludes(parent.countryEn, q) ||
            searchIncludes(parent.countryPt, q) ||
            searchIncludes(parent.iso3, q) ||
            searchIncludes(parent.abbrevEn, q) ||
            searchIncludes(parent.abbrevPt, q)),
      )
    )
  }

  const effectiveTableView: TableView =
    tableView === 'suburbs' && !showSuburbTab
      ? 'countries'
      : tableView === 'locais' && !showLocalTab
        ? 'countries'
        : tableView

  const filteredAreaRows = useMemo(() => {
    if (effectiveTableView !== 'areas') return []
    const rows = citySourceCountries.flatMap((c) => taggedAreaRows(c))
    const q = deferredQuery.trim()
    return rows.filter((r) => {
      const parent = countryById.get(r.countryId)
      if (!rowMatchesAreaFilter(r, parent, selectedAreaKeys)) return false
      if (selectedCityKeys.length > 0) {
        // Keep parent areas of any selected city.
        const keepsArea = selectedCityKeys.some((key) => {
          const parsed = parsePlaceFilterKey(key)
          if (!parsed || parsed.countryId !== r.countryId) return false
          return (
            parsed.code === r.code || parsed.code.startsWith(`${r.code}-`)
          )
        })
        if (!keepsArea) return false
      }
      return matchesPlaceQuery(r, q)
    })
  }, [
    citySourceCountries,
    deferredQuery,
    countryById,
    effectiveTableView,
    selectedAreaKeys,
    selectedCityKeys,
  ])

  const filteredCityRows = useMemo(() => {
    if (effectiveTableView !== 'cities') return []
    // Overseas: voting-city splits. Brazil: municipalities.
    const rows = citySourceCountries.flatMap((c) =>
      c.domestic ? taggedBrazilCityRows(c) : taggedBreakdownRows(c),
    )
    const q = deferredQuery.trim()
    return rows.filter((r) => {
      const parent = countryById.get(r.countryId)
      if (!rowMatchesAreaFilter(r, parent, selectedAreaKeys)) return false
      if (!rowMatchesCityFilter(r, selectedCityKeys)) return false
      return matchesPlaceQuery(r, q)
    })
  }, [
    citySourceCountries,
    deferredQuery,
    countryById,
    effectiveTableView,
    selectedAreaKeys,
    selectedCityKeys,
  ])

  const filteredSuburbRows = useMemo(() => {
    // Within-municipality voting locals — Brazil only.
    if (effectiveTableView !== 'suburbs') return []
    const rows = citySourceCountries
      .filter((c) => c.domestic)
      .flatMap((c) => taggedSuburbRows(c))
    const q = deferredQuery.trim()
    const filtered = rows.filter((r) => {
      const parent = countryById.get(r.countryId)
      if (!rowMatchesAreaFilter(r, parent, selectedAreaKeys)) return false
      if (!rowMatchesCityFilter(r, selectedCityKeys)) return false
      return matchesPlaceQuery(r, q)
    })
    // Same bairro label in the same município (e.g. several Campo Grande
    // zones in Rio) → one aggregated row.
    return groupSuburbRowsByNeighborhood(filtered, lang)
  }, [
    citySourceCountries,
    deferredQuery,
    countryById,
    effectiveTableView,
    selectedAreaKeys,
    selectedCityKeys,
    lang,
  ])

  const sortedAreas = useMemo(() => {
    if (effectiveTableView !== 'areas') return []
    const rows = [...filteredAreaRows]
    const dir = sortDir === 'asc' ? 1 : -1
    rows.sort(
      (a, b) => compareCityRows(a, b, countryById, sortKey, lang) * dir,
    )
    return rows
  }, [
    filteredAreaRows,
    sortKey,
    sortDir,
    lang,
    countryById,
    effectiveTableView,
  ])

  const sortedCities = useMemo(() => {
    if (effectiveTableView !== 'cities') return []
    const rows = [...filteredCityRows]
    const dir = sortDir === 'asc' ? 1 : -1
    rows.sort(
      (a, b) => compareCityRows(a, b, countryById, sortKey, lang) * dir,
    )
    return rows
  }, [
    filteredCityRows,
    sortKey,
    sortDir,
    lang,
    countryById,
    effectiveTableView,
  ])

  const sortedSuburbs = useMemo(() => {
    if (effectiveTableView !== 'suburbs') return []
    const rows = [...filteredSuburbRows]
    const dir = sortDir === 'asc' ? 1 : -1
    rows.sort(
      (a, b) => compareCityRows(a, b, countryById, sortKey, lang) * dir,
    )
    return rows
  }, [
    filteredSuburbRows,
    sortKey,
    sortDir,
    lang,
    countryById,
    effectiveTableView,
  ])

  const filteredLocalRows = useMemo(() => {
    if (effectiveTableView !== 'locais') return []
    const rows = (brazilLocais.locais ?? []).map((row) => {
      const tagged = row as BrazilLocalRow & { countryId: string }
      tagged.countryId = BRAZIL_ID
      return tagged
    })
    const q = deferredQuery.trim()
    return rows.filter((r) => {
      const parent = countryById.get(BRAZIL_ID)
      if (!rowMatchesAreaFilter(r, parent, selectedAreaKeys)) return false
      if (!rowMatchesCityFilter(r, selectedCityKeys)) return false
      if (mapFocus.level === 'city' && !r.code.startsWith(`${mapFocus.cityCode}-`)) {
        return false
      }
      if (mapFocus.level === 'uf' && !r.code.startsWith(`${mapFocus.uf}-`)) {
        return false
      }
      return matchesPlaceQuery(r, q)
    })
  }, [
    brazilLocais.locais,
    deferredQuery,
    countryById,
    effectiveTableView,
    selectedAreaKeys,
    selectedCityKeys,
    mapFocus,
  ])

  const sortedLocais = useMemo(() => {
    if (effectiveTableView !== 'locais') return []
    const rows = [...filteredLocalRows]
    const dir = sortDir === 'asc' ? 1 : -1
    rows.sort(
      (a, b) => compareCityRows(a, b, countryById, sortKey, lang) * dir,
    )
    return rows
  }, [
    filteredLocalRows,
    sortKey,
    sortDir,
    lang,
    countryById,
    effectiveTableView,
  ])

  // Drop highlight if the selected country is hidden again (world map only).
  const highlightVisible =
    mapFocus.level !== 'world' ||
    !highlightId ||
    mapCountries.some((c) => c.id === highlightId) ||
    filtered.some((c) => c.id === highlightId)
  const activeHighlight = highlightVisible ? highlightId : null
  const brazilAreas = brazilCountry?.areas ?? []
  const brazilCities = brazilCountry?.cities ?? []
  const brazilSuburbs = brazilCountry?.suburbs ?? []
  const brazilLocaisRows = brazilLocais.locais ?? []

  const lulaShare = totals.valid ? (totals.lula / totals.valid) * 100 : 0
  const bolsoShare = totals.valid ? (totals.bolsonaro / totals.valid) * 100 : 0
  const updated = new Date(data.meta.updatedAt).toLocaleString(
    lang === 'pt' ? 'pt-BR' : 'en-GB',
    { dateStyle: 'medium', timeStyle: 'medium' },
  )
  const zz = data.meta.tseZz
  const syncLabel =
    syncStatus === 'syncing'
      ? t('syncUpdating', lang)
      : syncStatus === 'error'
        ? t('syncError', lang)
        : live
          ? t('syncLive', lang)
          : isPressOnlyWindow()
            ? t('syncPress', lang)
            : t('syncSeed', lang)

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-[45vh] pt-6 sm:px-6 lg:max-w-7xl xl:max-w-[90rem] 2xl:max-w-[100rem]">
      <header className="animate-rise mb-8">
        <div className="mb-4 flex justify-end">
          <div className="flex flex-nowrap items-center gap-2">
            <button
              type="button"
              className="share-btn control px-3 py-1.5 text-sm font-semibold"
              aria-label={t('share', lang)}
              title={
                shareFeedback === 'copied'
                  ? t('shareCopied', lang)
                  : shareFeedback === 'failed'
                    ? t('shareFailed', lang)
                    : t('share', lang)
              }
              onClick={() => {
                void handleShare()
              }}
            >
              {shareFeedback === 'copied'
                ? t('shareCopied', lang)
                : shareFeedback === 'failed'
                  ? t('shareFailed', lang)
                  : t('share', lang)}
            </button>
            <button
              type="button"
              className="theme-btn control px-3 py-1.5 text-sm font-semibold"
              aria-label={
                theme === 'dark' ? t('themeLight', lang) : t('themeDark', lang)
              }
              title={
                theme === 'dark' ? t('themeLight', lang) : t('themeDark', lang)
              }
              onClick={toggleTheme}
            >
              {theme === 'dark' ? t('themeLight', lang) : t('themeDark', lang)}
            </button>
            <button
              type="button"
              className="lang-btn control px-3 py-1.5 text-sm font-semibold uppercase"
              aria-label={lang === 'pt' ? 'EN' : 'PT'}
              title={lang === 'pt' ? 'EN' : 'PT'}
              onClick={() => setLang(lang === 'pt' ? 'en' : 'pt')}
            >
              {lang === 'pt' ? 'EN' : 'PT'}
            </button>
            <button
              type="button"
              className="hard-refresh-btn control px-2 py-1.5 text-[var(--ink-muted)]"
              aria-label={t('hardRefresh', lang)}
              title={t('hardRefresh', lang)}
              onClick={() => {
                void hardRefresh()
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <path
                  d="M13.5 2.5v3.2h-3.2"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
        <p className="brand mb-4 text-3xl font-extrabold text-[var(--ink)] sm:text-4xl">
          {t('brand', lang)}
        </p>
        <h1 className="max-w-3xl text-xl font-semibold leading-snug text-[var(--ink)] sm:text-2xl">
          {data.meta.title[lang]}
        </h1>
        <p className="mt-2 max-w-2xl text-[var(--ink-muted)]">{data.meta.subtitle[lang]}</p>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">
          {t('scopeUnified', lang)}
        </p>
      </header>

      <section className="panel animate-rise-delay mb-6 rounded-xl p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
              {t('runningTotal', lang)}
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              {totals.reported}/{headerCountryDenom}{' '}
              {t('countries', lang)} ·{' '}
              {fmtInt(totals.valid, lang)} {t('validVotes', lang)}
            </p>
            <label
              className="mt-2 flex w-fit cursor-pointer items-center gap-2 text-sm text-[var(--ink-muted)]"
              title={t('includeBrazilHint', lang)}
              onMouseEnter={prefetchBrazilCitiesHandler}
              onFocus={prefetchBrazilCitiesHandler}
            >
              <input
                type="checkbox"
                className="accent-[var(--accent)]"
                checked={includeBrazil}
                onChange={(e) => setIncludeBrazilSynced(e.target.checked)}
              />
              {t('includeBrazil', lang)}
            </label>
          </div>
          <div className="text-right text-xs text-[var(--ink-muted)]">
            <p>
              <span
                className={
                  syncStatus === 'syncing'
                    ? 'font-semibold text-[var(--ink)]'
                    : syncStatus === 'error'
                      ? 'font-semibold text-[var(--bolso)]'
                      : live
                        ? 'font-semibold text-[var(--lula)]'
                        : undefined
                }
              >
                {syncLabel}
              </span>
              <span className="mx-1.5 text-[var(--line)]" aria-hidden>
                ·
              </span>
              {autoRefreshLabel(lang)}
            </p>
            <p className="mt-0.5">
              {t('updated', lang)}: {updated}
            </p>
            {zz ? (
              <p className="mt-0.5 tabular-nums">
                ZZ {fmtInt(zz.sectionsCounted, lang)}/{fmtInt(zz.sectionsTotal, lang)}{' '}
                ({fmtPct(zz.sectionsPct, lang)})
                <span className="mx-1.5 text-[var(--line)]" aria-hidden>
                  ·
                </span>
                {fmtInt(zz.totalValid, lang)} {t('validVotes', lang)}
              </p>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <TotalCard
            label={`${t('lula', lang)} · ${t('round2', lang)} 2026`}
            votes={totals.lula}
            pct={lulaShare}
            tone="lula"
            lang={lang}
          />
          <TotalCard
            label={`${t('fBolsonaro', lang)} · ${t('round2', lang)} 2026`}
            votes={totals.bolsonaro}
            pct={bolsoShare}
            tone="bolso"
            lang={lang}
          />
          <SwingCard
            swing={reportedAgg.roundSwing}
            label={metricLabel('roundSwing', lang)}
            hintKey="hintRoundSwing"
            lang={lang}
          />
        </div>
      </section>

      <section className="panel mb-6 rounded-xl p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="brand text-lg font-bold">{t('map', lang)}</h2>
            <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
              {reportedCount > 0
                ? `${reportedCount} ${t('reported', lang)}`
                : `${hist2022OverseasCount} ${t('with2022History', lang)}`}
            </p>
          </div>
          <label className="block w-full min-w-0 text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)] sm:min-w-[220px] sm:w-auto">
            {t('mapMetric', lang)}
            <select
              className="control mt-1 w-full max-w-full"
              value={metric}
              onChange={(e) => setMetric(e.target.value as MapMetric)}
              aria-describedby="heatmap-hint"
            >
              {mapMetrics.map((m) => (
                <option key={m} value={m}>
                  {metricLabel(m, lang)}
                </option>
              ))}
            </select>
            <span
              id="heatmap-hint"
              className="mt-1 block font-normal normal-case tracking-normal"
            >
              {t('heatmapHint', lang)}
            </span>
          </label>
        </div>
        <WorldMap
          countries={mapCountries}
          areas={brazilAreas}
          cities={brazilCities}
          suburbs={brazilSuburbs}
          locais={brazilLocaisRows}
          metric={metric}
          metricLabel={metricLabel(metric, lang)}
          lang={lang}
          focus={mapFocus}
          brazilGrain={
            effectiveTableView === 'locais'
              ? 'locais'
              : effectiveTableView === 'cities' ||
                  effectiveTableView === 'suburbs'
                ? 'cities'
                : 'ufs'
          }
          highlightId={activeHighlight}
          onPick={onMapPick}
          onBack={mapBack}
        />
      </section>

      <section className="panel panel-results mb-4 rounded-xl px-2 py-4 sm:p-5">
        <div
          ref={tableChromeRef}
          className="sticky-table-chrome sticky top-0 z-30 -mx-2 mb-3 border-b border-[var(--line)] px-2 pb-3 sm:-mx-5 sm:px-5"
        >
          <div className="sticky-table-chrome-inner space-y-3">
          <div
            className="flex flex-wrap gap-1"
            role="tablist"
            aria-label={t('tableView', lang)}
          >
            <button
              type="button"
              role="tab"
              className="lang-btn control px-3 py-1.5 text-sm font-semibold"
              aria-selected={effectiveTableView === 'countries'}
              onClick={() => switchTableView('countries')}
            >
              {t('tabCountries', lang)}
            </button>
            <button
              type="button"
              role="tab"
              className="lang-btn control px-3 py-1.5 text-sm font-semibold"
              aria-selected={effectiveTableView === 'areas'}
              title={t('areaTableHint', lang)}
              onClick={() => switchTableView('areas')}
            >
              {t('tabAreas', lang)}
            </button>
            <button
              type="button"
              role="tab"
              className="lang-btn control px-3 py-1.5 text-sm font-semibold"
              aria-selected={effectiveTableView === 'cities'}
              title={t('cityTableHint', lang)}
              onClick={() => switchTableView('cities')}
            >
              {t('tabCities', lang)}
            </button>
            {showSuburbTab ? (
              <button
                type="button"
                role="tab"
                className="lang-btn control px-3 py-1.5 text-sm font-semibold"
                aria-selected={effectiveTableView === 'suburbs'}
                title={t('suburbTableHint', lang)}
                onMouseEnter={prefetchBrazilSuburbsHandler}
                onFocus={prefetchBrazilSuburbsHandler}
                onClick={() => switchTableView('suburbs')}
              >
                {t('tabSuburbs', lang)}
              </button>
            ) : null}
            {showLocalTab ? (
              <button
                type="button"
                role="tab"
                className="lang-btn control px-3 py-1.5 text-sm font-semibold"
                aria-selected={effectiveTableView === 'locais'}
                title={t('localTableHint', lang)}
                onMouseEnter={() => prefetchBrazilLocais('2')}
                onFocus={() => prefetchBrazilLocais('2')}
                onClick={() => {
                  if (!includeBrazil) setIncludeBrazil(true)
                  if (mapFocus.level === 'world') {
                    setMapFocus({ level: 'brazil' })
                    setHighlightId(BRAZIL_ID)
                  }
                  switchTableView('locais')
                }}
              >
                {t('tabLocais', lang)}
              </button>
            ) : null}
          </div>

          <div className="filter-row filter-row--primary">
            <label className="filter-field filter-search text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
              <span className="filter-label">
                {effectiveTableView === 'areas'
                  ? t('searchArea', lang)
                  : effectiveTableView === 'cities'
                    ? t('searchCity', lang)
                    : effectiveTableView === 'suburbs'
                      ? t('searchSuburb', lang)
                      : effectiveTableView === 'locais'
                        ? t('searchLocal', lang)
                        : t('search', lang)}
              </span>
              <span className="filter-search-wrap mt-1">
                <input
                  className="control filter-search-input w-full min-w-0"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={
                    effectiveTableView === 'areas'
                      ? t('searchArea', lang)
                      : effectiveTableView === 'cities'
                        ? t('searchCity', lang)
                        : effectiveTableView === 'suburbs'
                          ? t('searchSuburb', lang)
                          : effectiveTableView === 'locais'
                            ? t('searchLocal', lang)
                            : t('search', lang)
                  }
                />
                {query ? (
                  <button
                    type="button"
                    className="filter-clear"
                    aria-label={t('clearSearch', lang)}
                    title={t('clearSearch', lang)}
                    onClick={clearSearch}
                  >
                    ×
                  </button>
                ) : null}
              </span>
            </label>
            <label className="filter-field filter-global-region text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
              <span className="filter-label">{t('filterGlobalRegions', lang)}</span>
              <select
                className="control mt-1 w-full min-w-0"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              >
                <option value="all">{t('allRegions', lang)}</option>
                {regions.map((r) => (
                  <option key={r} value={r}>
                    {regionLabel(r, lang)}
                  </option>
                ))}
              </select>
            </label>
            <MultiSelectFilter
              label={t('filterCountry', lang)}
              allLabel={t('allCountriesFilter', lang)}
              selectedCountLabel={selectedCountLabel}
              searchPlaceholder={t('filterSearchCountry', lang)}
              emptyLabel={t('filterEmpty', lang)}
              options={countryOptions}
              value={selectedCountryIds}
              onChange={onCountryFilterChange}
            />
            <MultiSelectFilter
              label={t('filterArea', lang)}
              allLabel={t('allAreasFilter', lang)}
              selectedCountLabel={selectedCountLabel}
              searchPlaceholder={t('filterSearchArea', lang)}
              emptyLabel={t('filterEmpty', lang)}
              options={areaOptions}
              value={selectedAreaKeys}
              onChange={onAreaFilterChange}
            />
            <MultiSelectFilter
              label={t('filterCity', lang)}
              allLabel={t('allCitiesFilter', lang)}
              selectedCountLabel={selectedCountLabel}
              searchPlaceholder={t('filterSearchCity', lang)}
              emptyLabel={t('filterEmpty', lang)}
              options={cityOptions}
              value={selectedCityKeys}
              onChange={setSelectedCityKeys}
            />
          </div>

          <div className="filter-row filter-row--tools">
            <label
              className="filter-tool filter-tool--brazil flex items-center gap-2 text-sm text-[var(--ink-muted)]"
              title={t('includeBrazilHint', lang)}
              onMouseEnter={prefetchBrazilCitiesHandler}
              onFocus={prefetchBrazilCitiesHandler}
            >
              <input
                type="checkbox"
                className="accent-[var(--accent)]"
                checked={includeBrazil}
                onChange={(e) => setIncludeBrazilSynced(e.target.checked)}
              />
              {t('includeBrazil', lang)}
            </label>
            <TableColumnPicker
              lang={lang}
              visible={visibleCols}
              columnOrder={columnOrder}
              onChange={setVisibleColsPersist}
              onReorder={reorderColumns}
            />
            <label className="filter-tool flex items-center gap-2 text-sm text-[var(--ink-muted)]">
              {t('sortBy', lang)}
              <select
                className="control"
                value={sortKey}
                onChange={(e) => {
                  const key = e.target.value as SortKey
                  setSortKey(key)
                  setSortDir(
                    key === 'country' || key === 'region' || key === 'city'
                      ? 'asc'
                      : 'desc',
                  )
                }}
              >
                {effectiveTableView === 'areas' ? (
                  <option value="city">{t('area', lang)}</option>
                ) : null}
                {effectiveTableView === 'cities' ? (
                  <option value="city">{t('city', lang)}</option>
                ) : null}
                {effectiveTableView === 'suburbs' ? (
                  <option value="city">{t('suburb', lang)}</option>
                ) : null}
                {effectiveTableView === 'locais' ? (
                  <option value="city">{t('local', lang)}</option>
                ) : null}
                <option value="votes2026">{t('votes2026', lang)}</option>
                <option value="votes2022">{t('votes2022', lang)}</option>
                <option value="lulaPct2026">{t('lulaPct2026', lang)}</option>
                <option value="bolsonaroPct2026">
                  {t('bolsonaroPct2026', lang)}
                </option>
                <option value="lulaPct2022">{t('lulaPct2022', lang)}</option>
                <option value="bolsonaroPct2022">
                  {t('bolsonaroPct2022', lang)}
                </option>
                <option value="difference2026">
                  {t('difference2026', lang)}
                </option>
                <option value="difference2022">
                  {t('difference2022', lang)}
                </option>
                <option value="otherPct2026">{t('otherPct2026', lang)}</option>
                <option value="otherPct2022">{t('otherPct2022', lang)}</option>
                <option value="noValidVotePct2026">
                  {t('noValidVotePct2026', lang)}
                </option>
                <option value="noValidVotePct2022">
                  {t('noValidVotePct2022', lang)}
                </option>
                <option value="noValidVotes2026">
                  {t('noValidVotes2026', lang)}
                </option>
                <option value="noValidVotes2022">
                  {t('noValidVotes2022', lang)}
                </option>
                <option value="lulaChange">{t('lulaChange', lang)}</option>
                <option value="bolsonaroChange">
                  {t('bolsonaroChange', lang)}
                </option>
                <option value="swing">{metricLabel('swing', lang)}</option>
                <option value="lulaRoundShift">
                  {metricLabel('lulaRoundShift', lang)}
                </option>
                <option value="bolsonaroRoundShift">
                  {metricLabel('bolsonaroRoundShift', lang)}
                </option>
                <option value="roundSwing">
                  {metricLabel('roundSwing', lang)}
                </option>
                <option value="lulaRoundShift2022">
                  {metricLabel('lulaRoundShift2022', lang)}
                </option>
                <option value="bolsonaroRoundShift2022">
                  {metricLabel('bolsonaroRoundShift2022', lang)}
                </option>
                <option value="roundSwing2022">
                  {metricLabel('roundSwing2022', lang)}
                </option>
                <option value="lulaRelativeGrowth">
                  {metricLabel('lulaRelativeGrowth', lang)}
                </option>
                <option value="bolsonaroRelativeGrowth">
                  {metricLabel('bolsonaroRelativeGrowth', lang)}
                </option>
                <option value="lulaRelativeGrowth2022">
                  {metricLabel('lulaRelativeGrowth2022', lang)}
                </option>
                <option value="bolsonaroRelativeGrowth2022">
                  {metricLabel('bolsonaroRelativeGrowth2022', lang)}
                </option>
                <option value="votes2026R1">
                  {metricLabel('votes2026R1', lang)}
                </option>
                <option value="votes2022R1">
                  {metricLabel('votes2022R1', lang)}
                </option>
                <option value="lulaPct2026R1">
                  {metricLabel('lulaPct2026R1', lang)}
                </option>
                <option value="bolsonaroPct2026R1">
                  {metricLabel('bolsonaroPct2026R1', lang)}
                </option>
                <option value="lulaPct2022R1">
                  {metricLabel('lulaPct2022R1', lang)}
                </option>
                <option value="bolsonaroPct2022R1">
                  {metricLabel('bolsonaroPct2022R1', lang)}
                </option>
                <option value="sections">{t('notes', lang)}</option>
                <option value="country">{t('country', lang)}</option>
                <option value="region">{t('region', lang)}</option>
              </select>
            </label>
            <label className="filter-tool flex items-center gap-2 text-sm text-[var(--ink-muted)]">
              {t('status', lang)}
              <select
                className="control"
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as 'reported' | 'all' | 'pending')
                }
              >
                <option value="reported">{t('statusReported', lang)}</option>
                <option value="all">{t('statusAll', lang)}</option>
                <option value="pending">{t('statusPending', lang)}</option>
              </select>
            </label>
          </div>
          </div>
        </div>

        {effectiveTableView === 'countries' ? (
          <ResultsTable
            rows={sorted}
            lang={lang}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
            highlightId={activeHighlight}
            onSelect={(id) => onSelect(id)}
            metric={metric}
            visibleCols={visibleCols}
            columnOrder={columnOrder}
            onReorderColumns={reorderColumns}
          />
        ) : (
          <CityBreakdownTable
            rows={
              effectiveTableView === 'areas'
                ? sortedAreas
                : effectiveTableView === 'suburbs'
                  ? sortedSuburbs
                  : effectiveTableView === 'locais'
                    ? sortedLocais
                    : sortedCities
            }
            countries={countryById}
            lang={lang}
            loading={
              (effectiveTableView === 'cities' &&
                showBrazilInTables &&
                brazilDomestic.citiesLoading &&
                !brazilDomestic.cities?.length) ||
              (effectiveTableView === 'suburbs' &&
                brazilDomestic.suburbsLoading &&
                !brazilDomestic.suburbs?.length) ||
              (effectiveTableView === 'locais' &&
                brazilLocais.loading &&
                !brazilLocais.locais?.length)
            }
            loadError={
              effectiveTableView === 'suburbs'
                ? brazilDomestic.suburbsError
                : effectiveTableView === 'locais'
                  ? brazilLocais.error
                  : null
            }
            onRetryLoad={
              effectiveTableView === 'suburbs'
                ? brazilDomestic.retrySuburbs
                : effectiveTableView === 'locais'
                  ? brazilLocais.retry
                  : undefined
            }
            showCountry
            placeKind={
              effectiveTableView === 'areas'
                ? 'area'
                : effectiveTableView === 'suburbs'
                  ? 'suburb'
                  : effectiveTableView === 'locais'
                    ? 'local'
                    : 'city'
            }
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
            visibleCols={visibleCols}
            columnOrder={columnOrder}
            onReorderColumns={reorderColumns}
          />
        )}
      </section>

      <footer className="mt-10 space-y-6 border-t border-[var(--line)] pt-6 text-sm text-[var(--ink-muted)]">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--ink)]">
            {t('disclaimers', lang)}
          </h2>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>{t('disclaimerUnofficial', lang)}</li>
            <li>{t('disclaimerBu', lang)}</li>
            <li>{t('disclaimerCompare', lang)}</li>
            <li>{t('disclaimerRoundShift', lang)}</li>
            <li>{t('disclaimerScope', lang)}</li>
          </ul>
        </div>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--ink)]">
            {t('sources', lang)}
          </h2>
          <ul className="mt-2 space-y-2">
            {data.meta.sources.map((s) => (
              <li key={s.url} className="leading-snug">
                <a
                  className="font-medium text-[var(--ink)] underline decoration-[var(--line)] underline-offset-2 hover:decoration-[var(--accent)]"
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {s.name}
                </a>
                {s.role ? (
                  <span className="text-xs"> — {s.role[lang]}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs">
          {t('updated', lang)}: {updated}. {t('howToEdit', lang)}
        </p>

        {activeHighlight &&
          mapFocus.level === 'world' &&
          data.countries.some((c) => c.id === activeHighlight) && (
          <p className="text-xs">
            → {countryName(data.countries.find((c) => c.id === activeHighlight)!, lang)}
          </p>
        )}
      </footer>
    </div>
  )
}

function TotalCard({
  label,
  votes,
  pct,
  tone,
  lang,
}: {
  label: string
  votes: number
  pct: number
  tone: 'lula' | 'bolso'
  lang: Lang
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold">{label}</span>
        <span className="tabular-nums text-lg font-bold">{fmtPct(pct, lang)}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-sm bg-[var(--paper-deep)]">
        <div
          className={`bar-fill h-full ${tone === 'lula' ? 'bar-lula' : 'bar-bolso'}`}
          style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
        />
      </div>
      <p className="mt-1 text-xs tabular-nums text-[var(--ink-muted)]">
        {fmtInt(votes, lang)}
      </p>
    </div>
  )
}

function SwingCard({
  swing,
  label,
  hintKey = 'hintSwing',
  lang,
}: {
  swing: number | null
  label: string
  hintKey?: 'hintSwing' | 'hintRoundSwing'
  lang: Lang
}) {
  const towardLula = (swing ?? 0) >= 0
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold">{label}</span>
        <span
          className={`tabular-nums text-lg font-bold ${
            towardLula ? 'text-[var(--lula)]' : 'text-[var(--bolso)]'
          }`}
        >
          {fmtPp(swing, lang)}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-sm bg-[var(--paper-deep)]">
        <div
          className={`bar-fill h-full ${towardLula ? 'bar-lula' : 'bar-bolso'}`}
          style={{
            width: `${Math.max(2, Math.min(100, Math.abs(swing ?? 0) * 8))}%`,
          }}
        />
      </div>
      <p className="mt-1 text-xs text-[var(--ink-muted)]">
        {t(hintKey, lang)}
      </p>
    </div>
  )
}

function compare(a: CountryResult, b: CountryResult, key: SortKey, lang: Lang): number {
  const av = sortValue(a, key, lang)
  const bv = sortValue(b, key, lang)
  const collator = collatorFor(lang)
  if (typeof av === 'string' && typeof bv === 'string') {
    return collator.compare(av, bv)
  }
  const an = av as number
  const bn = bv as number
  if (Number.isNaN(an) && Number.isNaN(bn)) {
    return collator.compare(countryName(a, lang), countryName(b, lang))
  }
  if (Number.isNaN(an)) return 1
  if (Number.isNaN(bn)) return -1
  if (an === bn) {
    return collator.compare(countryName(a, lang), countryName(b, lang))
  }
  return an - bn
}

function sortValue(c: CountryResult, key: SortKey, lang: Lang): number | string {
  switch (key) {
    case 'country':
      return countryName(c, lang)
    case 'region':
      return c.region
    case 'votes2026':
      return c.y2026?.totalValid ?? -1
    case 'votes2022':
      return c.y2022.totalValid
    case 'votes2026R1':
      return c.yRound1?.totalValid ?? -1
    case 'votes2022R1':
      return c.y2022Round1?.totalValid ?? -1
    case 'lulaPct2026':
      return c.y2026?.lulaPct ?? Number.NaN
    case 'bolsonaroPct2026':
      return c.y2026?.bolsonaroPct ?? Number.NaN
    case 'lulaPct2022':
      return c.y2022.lulaPct
    case 'bolsonaroPct2022':
      return c.y2022.bolsonaroPct
    case 'lulaPct2026R1':
      return c.yRound1?.lulaPct ?? Number.NaN
    case 'bolsonaroPct2026R1':
      return c.yRound1?.bolsonaroPct ?? Number.NaN
    case 'lulaPct2022R1':
      return c.y2022Round1?.lulaPct ?? Number.NaN
    case 'bolsonaroPct2022R1':
      return c.y2022Round1?.bolsonaroPct ?? Number.NaN
    case 'otherPct2026':
      return otherPct(c.y2026) ?? Number.NaN
    case 'otherPct2022':
      return otherPct(c.y2022) ?? Number.NaN
    case 'noValidVotePct2026':
      return noValidVotePct(c.y2026) ?? Number.NaN
    case 'noValidVotePct2022':
      return noValidVotePct(c.y2022) ?? Number.NaN
    case 'noValidVotes2026':
      return noValidVotes(c.y2026) ?? Number.NaN
    case 'noValidVotes2022':
      return noValidVotes(c.y2022) ?? Number.NaN
    case 'difference2026':
      return c.y2026 != null
        ? c.y2026.lulaPct - c.y2026.bolsonaroPct
        : Number.NaN
    case 'difference2022':
      return c.y2022.lulaPct - c.y2022.bolsonaroPct
    case 'difference2026R1':
      return c.yRound1
        ? c.yRound1.lulaPct - c.yRound1.bolsonaroPct
        : Number.NaN
    case 'difference2022R1':
      return c.y2022Round1
        ? c.y2022Round1.lulaPct - c.y2022Round1.bolsonaroPct
        : Number.NaN
    case 'lulaChange':
      return c.swing?.lulaPp ?? Number.NaN
    case 'bolsonaroChange':
      return c.swing?.bolsonaroPp ?? Number.NaN
    case 'swing':
      return c.swing != null
        ? c.swing.lulaPp - c.swing.bolsonaroPp
        : Number.NaN
    case 'lulaRoundShift':
      return c.y2026 && c.yRound1
        ? c.y2026.lulaPct - c.yRound1.lulaPct
        : Number.NaN
    case 'bolsonaroRoundShift':
      return c.y2026 && c.yRound1
        ? c.y2026.bolsonaroPct - c.yRound1.bolsonaroPct
        : Number.NaN
    case 'roundSwing': {
      if (!c.y2026 || !c.yRound1) return Number.NaN
      const l = c.y2026.lulaPct - c.yRound1.lulaPct
      const b = c.y2026.bolsonaroPct - c.yRound1.bolsonaroPct
      return l - b
    }
    case 'lulaRoundShift2022':
      return c.y2022 && c.y2022Round1
        ? c.y2022.lulaPct - c.y2022Round1.lulaPct
        : Number.NaN
    case 'bolsonaroRoundShift2022':
      return c.y2022 && c.y2022Round1
        ? c.y2022.bolsonaroPct - c.y2022Round1.bolsonaroPct
        : Number.NaN
    case 'roundSwing2022': {
      if (!c.y2022 || !c.y2022Round1) return Number.NaN
      const l = c.y2022.lulaPct - c.y2022Round1.lulaPct
      const b = c.y2022.bolsonaroPct - c.y2022Round1.bolsonaroPct
      return l - b
    }
    case 'lulaRelativeGrowth':
      return c.y2026 && c.yRound1 && c.yRound1.lula > 0
        ? ((c.y2026.lula - c.yRound1.lula) / c.yRound1.lula) * 100
        : Number.NaN
    case 'bolsonaroRelativeGrowth':
      return c.y2026 && c.yRound1 && c.yRound1.bolsonaro > 0
        ? ((c.y2026.bolsonaro - c.yRound1.bolsonaro) / c.yRound1.bolsonaro) * 100
        : Number.NaN
    case 'lulaRelativeGrowth2022':
      return c.y2022 && c.y2022Round1 && c.y2022Round1.lula > 0
        ? ((c.y2022.lula - c.y2022Round1.lula) / c.y2022Round1.lula) * 100
        : Number.NaN
    case 'bolsonaroRelativeGrowth2022':
      return c.y2022 && c.y2022Round1 && c.y2022Round1.bolsonaro > 0
        ? ((c.y2022.bolsonaro - c.y2022Round1.bolsonaro) / c.y2022Round1.bolsonaro) * 100
        : Number.NaN
    case 'sections':
      return c.coverage && c.coverage.total > 0
        ? c.coverage.counted / c.coverage.total
        : Number.NaN
    case 'city':
      return countryName(c, lang)
  }
}
