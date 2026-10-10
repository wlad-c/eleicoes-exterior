import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import raw from './data/results.json'
import { CityBreakdownTable } from './components/CityBreakdownTable'
import { MultiSelectFilter } from './components/MultiSelectFilter'
import { ResultsTable } from './components/ResultsTable'
import { TableColumnPicker } from './components/TableColumnPicker'
import { WorldMap } from './components/WorldMap'
import {
  abstentionPct,
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
import { regionLabel, t } from './lib/i18n'
import { collatorFor } from './lib/collator'
import { searchIncludes } from './lib/searchText'
import {
  prefetchBrazilCities,
  prefetchBrazilSuburbs,
  useBrazilDomestic,
} from './lib/useBrazilDomestic'

type TableView = 'countries' | 'areas' | 'cities' | 'suburbs'
const BRAZIL_ID = 'brazil'
import {
  moveColumn,
  readStoredColumnOrder,
  readStoredTableCols,
  writeStoredColumnOrder,
  writeStoredTableCols,
  type TableMetricCol,
} from './lib/tableColumns'
import { useTheme } from './lib/theme'
import { autoRefreshLabel, useResultsData } from './lib/useResultsData'
import type { CountryResult, Lang, MapMetric, ResultsData, SortKey } from './types'
import { HEATMAP_METRICS } from './types'

const seed = raw as ResultsData

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

export default function App() {
  const { theme, setTheme } = useTheme()
  const { data: seedData, syncStatus, live } = useResultsData(seed)
  const [lang, setLangState] = useState<Lang>(() =>
    typeof window === 'undefined' ? 'pt' : readStoredLang(),
  )
  const setLang = (next: Lang) => {
    setLangState(next)
    try {
      localStorage.setItem(LANG_KEY, next)
    } catch {
      /* ignore */
    }
  }
  const [query, setQuery] = useState('')
  /** Keep typing snappy while large Brazil tables filter/sort. */
  const deferredQuery = useDeferredValue(query)
  const [region, setRegion] = useState('all')
  const [statusFilter, setStatusFilter] = useState<'reported' | 'all' | 'pending'>(
    'reported',
  )
  /** Multi-select geo filters above the table (cascading country → area → city). */
  const [selectedCountryIds, setSelectedCountryIds] = useState<string[]>([])
  const [selectedAreaKeys, setSelectedAreaKeys] = useState<string[]>([])
  const [selectedCityKeys, setSelectedCityKeys] = useState<string[]>([])
  const [metric, setMetric] = useState<MapMetric>('leader2026')
  const [sortKey, setSortKey] = useState<SortKey>('votes2026')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [highlightId, setHighlightId] = useState<string | null>(null)
  /** World → Brazil UFs → municipalities → neighborhoods. */
  const [mapFocus, setMapFocus] = useState<MapFocus>({ level: 'world' })
  /** Domestic Brazil is hidden from tables until toggled or selected on the map. */
  const [includeBrazil, setIncludeBrazil] = useState(false)
  const [tableView, setTableView] = useState<TableView>('countries')
  const wantBrazil =
    includeBrazil ||
    highlightId === BRAZIL_ID ||
    mapFocus.level !== 'world'
  // Cities (municipalities) when Brazil is included; locals on Suburb tab or
  // when the map is drilled into a city (neighborhood markers).
  const brazilDomestic = useBrazilDomestic({
    wantCities: wantBrazil,
    wantSuburbs:
      wantBrazil && (tableView === 'suburbs' || mapFocus.level === 'city'),
  })

  const data = useMemo(() => {
    if (!brazilDomestic.cities?.length && !brazilDomestic.suburbs?.length) {
      return seedData
    }
    return {
      ...seedData,
      countries: seedData.countries.map((c) =>
        c.id === BRAZIL_ID
          ? {
              ...c,
              cities: brazilDomestic.cities ?? c.cities,
              cityCount:
                brazilDomestic.cities?.length ?? c.cityCount ?? c.cities?.length,
              suburbs: brazilDomestic.suburbs ?? c.suburbs,
              suburbCount:
                brazilDomestic.suburbs?.length ??
                c.suburbCount ??
                c.suburbs?.length,
            }
          : c,
      ),
    }
  }, [seedData, brazilDomestic.cities, brazilDomestic.suburbs])
  const [visibleCols, setVisibleCols] = useState<TableMetricCol[]>(() =>
    readStoredTableCols(),
  )
  const [columnOrder, setColumnOrder] = useState<TableMetricCol[]>(() =>
    readStoredColumnOrder(),
  )
  const tableChromeRef = useRef<HTMLDivElement>(null)

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
  }, [lang])

  useEffect(() => {
    const el = tableChromeRef.current
    if (!el) return
    const syncHeadOffset = () => {
      document.documentElement.style.setProperty(
        '--sticky-table-head-top',
        `${Math.ceil(el.getBoundingClientRect().height)}px`,
      )
    }
    syncHeadOffset()
    const ro = new ResizeObserver(syncHeadOffset)
    ro.observe(el)
    window.addEventListener('resize', syncHeadOffset)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', syncHeadOffset)
    }
  }, [])

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

  const totals = useMemo(() => runningTotals(data.countries), [data.countries])
  const reportedCountries = useMemo(
    () => data.countries.filter((c) => c.status === 'reported'),
    [data.countries],
  )
  /** Overseas-only set for the header aggregate cards. */
  const reportedOverseas = useMemo(
    () => reportedCountries.filter((c) => !c.domestic),
    [reportedCountries],
  )
  const reportedAgg = useMemo(
    () => aggregateRows(reportedOverseas),
    [reportedOverseas],
  )
  const reportedCount = reportedOverseas.length

  const mapCountries = reportedCountries

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
    // City / Bairro tabs drive a Brazil city map (municipalities with
    // neighborhood data) — not the world choropleth.
    if (next === 'cities' || next === 'suburbs') {
      setIncludeBrazil(true)
      prefetchBrazilCities()
      if (next === 'suburbs') prefetchBrazilSuburbs()
      applyCountryFilter(BRAZIL_ID)
      setHighlightId(BRAZIL_ID)

      if (next === 'suburbs' && selectedCityKeys.length === 1) {
        const parsed = parsePlaceFilterKey(selectedCityKeys[0])
        const cityCode = parsed?.code
        const uf = cityCode ? ufFromCityCode(cityCode) : null
        if (cityCode && uf) {
          setMapFocus({ level: 'city', uf, cityCode })
          setHighlightId(cityCode)
          return
        }
      }
      if (selectedAreaKeys.length === 1) {
        const parsed = parsePlaceFilterKey(selectedAreaKeys[0])
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
    if (next === 'areas') {
      setIncludeBrazil(true)
      prefetchBrazilCities()
      applyCountryFilter(BRAZIL_ID)
      if (mapFocus.level === 'world') {
        setMapFocus({ level: 'brazil' })
        setHighlightId(BRAZIL_ID)
      } else if (mapFocus.level === 'city') {
        setMapFocus({ level: 'uf', uf: mapFocus.uf })
        setHighlightId(mapFocus.uf)
      }
    }
    if (next === 'countries' && mapFocus.level !== 'world') {
      setMapFocus({ level: 'world' })
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
    // Zooming out to Brazil while on City/Bairro keeps that tab — the map
    // shows the national municipality choropleth instead of UFs.
    if (
      focus.level === 'brazil' &&
      (tableView === 'cities' || tableView === 'suburbs')
    ) {
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
      syncTabToFocus(next)
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
      if (statusFilter === 'reported' && c.status !== 'reported') return false
      if (statusFilter === 'pending' && c.status !== 'pending') return false
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

  const countryOptions = useMemo(
    () => countryFilterOptions(filterableCountries, lang),
    [filterableCountries, lang],
  )

  const areaSourceCountries = useMemo(() => {
    if (selectedCountryIds.length === 0) return filterableCountries
    return filterableCountries.filter((c) => selectedCountryIds.includes(c.id))
  }, [filterableCountries, selectedCountryIds])

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
    tableView === 'suburbs' && !showSuburbTab ? 'countries' : tableView

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

  const lulaShare = totals.valid ? (totals.lula / totals.valid) * 100 : 0
  const bolsoShare = totals.valid ? (totals.bolsonaro / totals.valid) * 100 : 0
  const updated = new Date(data.meta.updatedAt).toLocaleString(
    lang === 'pt' ? 'pt-BR' : 'en-GB',
    { dateStyle: 'medium', timeStyle: 'medium' },
  )
  const zz = data.meta.tseZz
  const syncLabel =
    syncStatus === 'syncing'
      ? lang === 'pt'
        ? 'atualizando TSE…'
        : 'updating TSE…'
      : syncStatus === 'error'
        ? lang === 'pt'
          ? 'falha no TSE — tentando de novo'
          : 'TSE fetch failed — retrying'
        : live
          ? lang === 'pt'
            ? 'TSE ao vivo'
            : 'live TSE'
          : lang === 'pt'
            ? 'seed local'
            : 'local seed'

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-[45vh] pt-6 sm:px-6 lg:max-w-7xl xl:max-w-[90rem] 2xl:max-w-[100rem]">
      <header className="animate-rise mb-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="brand text-3xl font-extrabold text-[var(--ink)] sm:text-4xl">
            {t('brand', lang)}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex gap-1"
              role="group"
              aria-label={t('themeToggle', lang)}
            >
              <button
                type="button"
                className="theme-btn control px-3 py-1.5 text-sm font-semibold"
                aria-pressed={theme === 'light'}
                aria-label={t('themeLight', lang)}
                title={t('themeLight', lang)}
                onClick={() => setTheme('light')}
              >
                {t('themeLight', lang)}
              </button>
              <button
                type="button"
                className="theme-btn control px-3 py-1.5 text-sm font-semibold"
                aria-pressed={theme === 'dark'}
                aria-label={t('themeDark', lang)}
                title={t('themeDark', lang)}
                onClick={() => setTheme('dark')}
              >
                {t('themeDark', lang)}
              </button>
            </div>
            <div className="flex gap-1">
              {(['en', 'pt'] as Lang[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  className="lang-btn control px-3 py-1.5 text-sm font-semibold uppercase"
                  aria-pressed={lang === l}
                  onClick={() => setLang(l)}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
        <h1 className="max-w-3xl text-xl font-semibold leading-snug text-[var(--ink)] sm:text-2xl">
          {data.meta.title[lang]}
        </h1>
        <p className="mt-2 max-w-2xl text-[var(--ink-muted)]">{data.meta.subtitle[lang]}</p>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">{t('scope', lang)}</p>
      </header>

      <section className="panel animate-rise-delay mb-6 rounded-xl p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
              {t('runningTotal', lang)}
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              {totals.reported}/
              {
                data.countries.filter((c) => !c.domestic).length
              }{' '}
              {t('countries', lang)} ·{' '}
              {fmtInt(totals.valid, lang)} {t('validVotes', lang)}
            </p>
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
            label={t('lula', lang)}
            votes={totals.lula}
            pct={lulaShare}
            tone="lula"
            lang={lang}
          />
          <TotalCard
            label={t('fBolsonaro', lang)}
            votes={totals.bolsonaro}
            pct={bolsoShare}
            tone="bolso"
            lang={lang}
          />
          <SwingCard swing={reportedAgg.swingToLula} lang={lang} />
        </div>
      </section>

      <section className="panel mb-6 rounded-xl p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="brand text-lg font-bold">{t('map', lang)}</h2>
            <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
              {reportedCount} {t('reported', lang)}
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
              {HEATMAP_METRICS.map((m) => (
                <option key={m} value={m}>
                  {t(m, lang)}
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
          metric={metric}
          lang={lang}
          focus={mapFocus}
          brazilGrain={
            effectiveTableView === 'cities' || effectiveTableView === 'suburbs'
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
          className="sticky-table-chrome sticky top-0 z-30 -mx-2 mb-3 space-y-3 border-b border-[var(--line)] px-2 pb-3 sm:-mx-5 sm:px-5"
        >
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
                onMouseEnter={prefetchBrazilSuburbs}
                onFocus={prefetchBrazilSuburbs}
                onClick={() => switchTableView('suburbs')}
              >
                {t('tabSuburbs', lang)}
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
              className="flex items-center gap-2 text-sm text-[var(--ink-muted)]"
              title={t('includeBrazilHint', lang)}
              onMouseEnter={prefetchBrazilCities}
              onFocus={prefetchBrazilCities}
            >
              <input
                type="checkbox"
                className="accent-[var(--accent)]"
                checked={includeBrazil}
                onChange={(e) => {
                  const on = e.target.checked
                  if (on) prefetchBrazilCities()
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
                }}
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
            <label className="flex items-center gap-2 text-sm text-[var(--ink-muted)]">
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
                <option value="otherPct2026">{t('otherPct2026', lang)}</option>
                <option value="otherPct2022">{t('otherPct2022', lang)}</option>
                <option value="abstentionPct2026">
                  {t('abstentionPct2026', lang)}
                </option>
                <option value="abstentionPct2022">
                  {t('abstentionPct2022', lang)}
                </option>
                <option value="lulaChange">{t('lulaChange', lang)}</option>
                <option value="bolsonaroChange">
                  {t('bolsonaroChange', lang)}
                </option>
                <option value="swingToLula">{t('swingToLula', lang)}</option>
                <option value="swingToBolsonaro">
                  {t('swingToBolsonaro', lang)}
                </option>
                <option value="sections">{t('notes', lang)}</option>
                <option value="country">{t('country', lang)}</option>
                <option value="region">{t('region', lang)}</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--ink-muted)]">
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
                !brazilDomestic.suburbs?.length)
            }
            loadError={
              effectiveTableView === 'suburbs'
                ? brazilDomestic.suburbsError
                : null
            }
            onRetryLoad={
              effectiveTableView === 'suburbs'
                ? brazilDomestic.retrySuburbs
                : undefined
            }
            showCountry
            placeKind={
              effectiveTableView === 'areas'
                ? 'area'
                : effectiveTableView === 'suburbs'
                  ? 'suburb'
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
        <span className="tabular-nums text-lg font-bold">{fmtInt(votes, lang)}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-sm bg-[var(--paper-deep)]">
        <div
          className={`bar-fill h-full ${tone === 'lula' ? 'bar-lula' : 'bar-bolso'}`}
          style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
        />
      </div>
      <p className="mt-1 text-xs tabular-nums text-[var(--ink-muted)]">{fmtPct(pct, lang)}</p>
    </div>
  )
}

function SwingCard({
  swing,
  lang,
}: {
  swing: number | null
  lang: Lang
}) {
  const towardLula = (swing ?? 0) >= 0
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold">{t('swingToLula', lang)}</span>
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
        {t('hintSwingToLula', lang)}
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
    case 'lulaPct2026':
      return c.y2026?.lulaPct ?? Number.NaN
    case 'bolsonaroPct2026':
      return c.y2026?.bolsonaroPct ?? Number.NaN
    case 'lulaPct2022':
      return c.y2022.lulaPct
    case 'bolsonaroPct2022':
      return c.y2022.bolsonaroPct
    case 'otherPct2026':
      return otherPct(c.y2026) ?? Number.NaN
    case 'otherPct2022':
      return otherPct(c.y2022) ?? Number.NaN
    case 'abstentionPct2026':
      return abstentionPct(c.y2026) ?? Number.NaN
    case 'abstentionPct2022':
      return abstentionPct(c.y2022) ?? Number.NaN
    case 'lulaChange':
      return c.swing?.lulaPp ?? Number.NaN
    case 'bolsonaroChange':
      return c.swing?.bolsonaroPp ?? Number.NaN
    case 'swingToLula':
      return c.swing != null
        ? c.swing.lulaPp - c.swing.bolsonaroPp
        : Number.NaN
    case 'swingToBolsonaro':
      return c.swing != null
        ? c.swing.bolsonaroPp - c.swing.lulaPp
        : Number.NaN
    case 'sections':
      return c.coverage && c.coverage.total > 0
        ? c.coverage.counted / c.coverage.total
        : Number.NaN
    case 'city':
      return countryName(c, lang)
  }
}
