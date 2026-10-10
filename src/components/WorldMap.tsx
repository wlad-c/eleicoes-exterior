import { geoEqualEarth, geoPath, geoCentroid } from 'd3-geo'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { feature } from 'topojson-client'
import type { Topology, GeometryCollection } from 'topojson-specification'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import worldAtlas from 'world-atlas/countries-110m.json'
import {
  NO_VALID_VOTE_COLOR,
  NO_VALID_VOTE_COLOR_LIGHT,
  BOLSONARO_COLOR,
  BOLSONARO_COLOR_LIGHT,
  LULA_COLOR,
  LULA_COLOR_LIGHT,
  OTHER_COLOR,
  OTHER_COLOR_LIGHT,
  VOTES_COLOR,
  VOTES_COLOR_LIGHT,
  extentForMetric,
  legendModeForMetric,
  makeMetricColorizer,
  NO_DATA_FILL,
  PENDING_FILL,
} from '../lib/colors'
import {
  cityDisplayName,
  countryName,
  formatMetricValue,
  fmtPct,
  metricValue,
  type VoteLike,
} from '../lib/format'
import {
  brazilUfCollection,
  citiesWithNeighborhoods,
  fetchBrazilMunicipalityCollection,
  fetchCityFeature,
  fetchUfMunicipalityCollection,
  suburbsForCity,
  ufFromCityCode,
  type MapFocus,
  type MapPick,
} from '../lib/brazilGeo'
import { t } from '../lib/i18n'
import { numericIdForIso3 } from '../lib/iso'
import type { CityResult, CountryResult, Lang, MapMetric } from '../types'

type Props = {
  countries: CountryResult[]
  /** Brazil UF rows (Area tab). */
  areas?: CityResult[]
  /** Brazil municipalities (City tab). */
  cities?: CityResult[]
  /** Brazil neighborhoods / zonas (Bairro tab). */
  suburbs?: CityResult[]
  metric: MapMetric
  lang: Lang
  focus: MapFocus
  /**
   * At Brazil focus: `ufs` = state choropleth (Area tab);
   * `cities` = map of municipalities that have neighborhood (zona) data.
   */
  brazilGrain?: 'ufs' | 'cities'
  highlightId: string | null
  onPick: (pick: MapPick) => void
  onBack: () => void
}

type Tip = {
  x: number
  y: number
  title: string
  row: VoteLike
}

type MapView = { k: number; x: number; y: number }

const VIEW_RESET: MapView = { k: 1, x: 0, y: 0 }
const ZOOM_MIN = 1
const ZOOM_MAX = 8
const ZOOM_STEP = 1.4

type DrawnFeature = {
  id: string
  d: string
  row: VoteLike | undefined
  label: string
  pick: MapPick
  /** Circle marker (neighborhood / city point) instead of a path fill. */
  circle?: { cx: number; cy: number; r: number }
  /** UF city choropleth: municipality has a neighborhood drill-down. */
  multiZone?: boolean
}

export function WorldMap({
  countries,
  areas = [],
  cities = [],
  suburbs = [],
  metric,
  lang,
  focus,
  brazilGrain = 'ufs',
  highlightId,
  onPick,
  onBack,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const viewRef = useRef<MapView>(VIEW_RESET)
  const dragRef = useRef<{
    pointerId: number
    lastX: number
    lastY: number
    moved: boolean
  } | null>(null)
  /** Survives pointerup so the trailing click after a pan is ignored. */
  const suppressClickRef = useRef(false)
  const [width, setWidth] = useState(960)
  const [tip, setTip] = useState<Tip | null>(null)
  const [view, setView] = useState<MapView>(VIEW_RESET)
  const ufMesh = useMemo(() => brazilUfCollection(), [])
  const [munMesh, setMunMesh] = useState<FeatureCollection<
    Geometry,
    { id: string }
  > | null>(null)
  /** National municipality mesh for Brazil City-tab choropleth. */
  const [brazilMunMesh, setBrazilMunMesh] = useState<FeatureCollection<
    Geometry,
    { id: string }
  > | null>(null)
  const [cityFeature, setCityFeature] = useState<Feature<
    Geometry,
    { id: string }
  > | null>(null)
  const [geoLoading, setGeoLoading] = useState(false)

  useEffect(() => {
    viewRef.current = view
  }, [view])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setWidth(Math.max(320, Math.floor(entry.contentRect.width)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Drill / back leaves a hover tip stranded on touch (no mouseleave).
  useEffect(() => {
    setTip(null)
    setView(VIEW_RESET)
  }, [focus])

  const height = Math.round(width * (width < 520 ? 0.58 : 0.48))

  useEffect(() => {
    if (!tip) return
    const onPointerDown = (e: PointerEvent) => {
      const node = e.target as Node
      if (wrapRef.current?.contains(node)) return
      if (tipRef.current?.contains(node)) return
      setTip(null)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTip(null)
    }
    // Bubble only — capture scroll clears tips on iPad nested/rubber-band noise.
    const onScroll = () => setTip(null)
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', onScroll)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onScroll)
    }
  }, [tip])

  const showTipAt = useCallback(
    (
      e: { clientX: number; clientY: number },
      title: string,
      row: VoteLike,
    ) => {
      // Viewport coords — tip is portaled fixed so html overflow-x:clip
      // and panel edges cannot hide the metric lines on iPad.
      const tipW = Math.min(280, window.innerWidth - 16)
      const left = Math.min(
        Math.max(8, e.clientX + 12),
        window.innerWidth - tipW - 8,
      )
      const top = Math.min(
        Math.max(8, e.clientY - 8),
        window.innerHeight - 120,
      )
      setTip({
        x: left,
        y: top,
        title,
        row,
      })
    },
    [],
  )

  const clearTip = useCallback(() => setTip(null), [])

  const onMapMouseLeave = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      // Tip is portaled outside wrap — keep it when moving onto the ×.
      if (
        e.relatedTarget instanceof Node &&
        tipRef.current?.contains(e.relatedTarget)
      ) {
        return
      }
      clearTip()
    },
    [clearTip],
  )

  const svgPoint = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current
      if (!svg) return { x: width / 2, y: height / 2 }
      const ctm = svg.getScreenCTM()
      if (!ctm) return { x: width / 2, y: height / 2 }
      const pt = svg.createSVGPoint()
      pt.x = clientX
      pt.y = clientY
      const p = pt.matrixTransform(ctm.inverse())
      return { x: p.x, y: p.y }
    },
    [width, height],
  )

  const applyZoom = useCallback(
    (factor: number, anchor?: { x: number; y: number }) => {
      setView((v) => {
        const nextK = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.k * factor))
        if (nextK === ZOOM_MIN) return VIEW_RESET
        if (Math.abs(nextK - v.k) < 0.001) return v
        const ax = anchor?.x ?? width / 2
        const ay = anchor?.y ?? height / 2
        const scale = nextK / v.k
        return {
          k: nextK,
          x: ax - (ax - v.x) * scale,
          y: ay - (ay - v.y) * scale,
        }
      })
    },
    [width, height],
  )

  const zoomIn = useCallback(() => {
    clearTip()
    applyZoom(ZOOM_STEP)
  }, [applyZoom, clearTip])

  const zoomOut = useCallback(() => {
    clearTip()
    applyZoom(1 / ZOOM_STEP)
  }, [applyZoom, clearTip])

  const zoomReset = useCallback(() => {
    clearTip()
    setView(VIEW_RESET)
  }, [clearTip])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault()
      clearTip()
      const anchor = svgPoint(e.clientX, e.clientY)
      const factor =
        Math.abs(e.deltaY) > 40
          ? e.deltaY < 0
            ? ZOOM_STEP
            : 1 / ZOOM_STEP
          : e.deltaY < 0
            ? 1.12
            : 1 / 1.12
      applyZoom(factor, anchor)
    }
    // Non-passive so preventDefault actually stops page scroll while zooming.
    svg.addEventListener('wheel', onWheelNative, { passive: false })
    return () => svg.removeEventListener('wheel', onWheelNative)
  }, [applyZoom, clearTip, svgPoint])

  const onStagePointerDown = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (e.button !== 0) return
      // Only pan when zoomed; unzoomed clicks still select features.
      if (viewRef.current.k <= 1.001) return
      const target = e.target as Element | null
      // Let feature clicks / tip path work; pan from empty chrome.
      if (target?.closest?.('[data-map-id]')) return
      dragRef.current = {
        pointerId: e.pointerId,
        lastX: e.clientX,
        lastY: e.clientY,
        moved: false,
      }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [],
  )

  const onStagePointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== e.pointerId) return
      const dx = e.clientX - drag.lastX
      const dy = e.clientY - drag.lastY
      if (!drag.moved && dx * dx + dy * dy < 9) return
      drag.moved = true
      drag.lastX = e.clientX
      drag.lastY = e.clientY
      const svg = svgRef.current
      const ctm = svg?.getScreenCTM()
      const scale = ctm ? ctm.a : 1
      setView((v) => ({
        ...v,
        x: v.x + dx / scale,
        y: v.y + dy / scale,
      }))
      clearTip()
    },
    [clearTip],
  )

  const endStageDrag = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    if (drag.moved) suppressClickRef.current = true
    dragRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
  }, [])

  /** Touch synthesizes mouseenter then never mouseleave — keep tip until dismiss. */
  const handleFeatureClick = useCallback(
    (e: ReactMouseEvent, f: DrawnFeature) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false
        return
      }
      if (f.row) showTipAt(e, f.label, f.row)
      else clearTip()
      onPick(f.pick)
    },
    [showTipAt, clearTip, onPick],
  )

  useEffect(() => {
    let cancelled = false
    if (focus.level !== 'uf' && focus.level !== 'city') {
      setMunMesh(null)
      return
    }
    const uf = focus.uf
    if (!cities.length) return
    setGeoLoading(true)
    void fetchUfMunicipalityCollection(uf, cities).then((fc) => {
      if (!cancelled) {
        setMunMesh(fc)
        setGeoLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [focus, cities])

  useEffect(() => {
    let cancelled = false
    if (!(focus.level === 'brazil' && brazilGrain === 'cities')) {
      return
    }
    if (!cities.length) return
    setGeoLoading(true)
    void fetchBrazilMunicipalityCollection(cities).then((fc) => {
      if (!cancelled) {
        setBrazilMunMesh(fc)
        setGeoLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [focus.level, brazilGrain, cities])

  useEffect(() => {
    let cancelled = false
    if (focus.level !== 'city') {
      setCityFeature(null)
      return
    }
    if (!cities.length) return
    setGeoLoading(true)
    void fetchCityFeature(focus.uf, focus.cityCode, cities).then((f) => {
      if (!cancelled) {
        setCityFeature(f)
        setGeoLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [focus, cities])

  const neighborhoodCities = useMemo(
    () => citiesWithNeighborhoods(cities, suburbs),
    [cities, suburbs],
  )

  const colorRows: VoteLike[] = useMemo(() => {
    if (focus.level === 'brazil') {
      // City tab: colour every municipality on the national choropleth.
      return brazilGrain === 'cities' ? cities : areas
    }
    if (focus.level === 'uf') {
      return cities.filter((c) => c.area === focus.uf)
    }
    if (focus.level === 'city') {
      const local = suburbsForCity(suburbs, focus.cityCode)
      return local.length ? local : cities.filter((c) => c.code === focus.cityCode)
    }
    return countries
  }, [
    focus,
    brazilGrain,
    areas,
    cities,
    suburbs,
    countries,
    neighborhoodCities,
  ])

  // Colour domain = every place drawn in this view (incl. domestic Brazil).
  // Vote-count metrics still use log1p inside makeMetricColorizer.
  const colorize = useMemo(
    () => makeMetricColorizer(metric, colorRows),
    [metric, colorRows],
  )
  const legendExtent = useMemo(
    () => extentForMetric(colorRows, metric),
    [colorRows, metric],
  )
  const legendMode = legendModeForMetric(metric)

  const byNumeric = useMemo(() => {
    const m = new Map<string, CountryResult>()
    for (const c of countries) {
      const nid = numericIdForIso3(c.iso3)
      if (nid == null || nid === '') continue
      m.set(String(Number(nid)), c)
    }
    return m
  }, [countries])

  const areaByUf = useMemo(() => {
    const m = new Map<string, CityResult>()
    for (const a of areas) m.set(a.code, a)
    return m
  }, [areas])

  const cityByCode = useMemo(() => {
    const m = new Map<string, CityResult>()
    for (const c of cities) m.set(c.code, c)
    return m
  }, [cities])

  const { drawn, fitReady } = useMemo(() => {
    if (focus.level === 'world') {
      const topo = worldAtlas as unknown as Topology<{
        countries: GeometryCollection
      }>
      const fc = feature(
        topo,
        topo.objects.countries,
      ) as FeatureCollection<Geometry>
      const projection = geoEqualEarth().fitSize([width, height], fc)
      const path = geoPath(projection)
      const items: DrawnFeature[] = fc.features.map((f, i) => {
        const rawId = f.id
        const numericKey =
          rawId != null && rawId !== '' ? String(Number(rawId)) : ''
        const c =
          numericKey && numericKey !== 'NaN'
            ? byNumeric.get(numericKey)
            : undefined
        return {
          id: c?.id ?? (numericKey || `geo-${i}`),
          d: path(f) ?? '',
          row: c,
          label: c ? countryName(c, lang) : '',
          pick: c
            ? { kind: 'country', id: c.id }
            : { kind: 'background' },
        }
      })
      return { drawn: items, fitReady: true }
    }

    if (focus.level === 'brazil') {
      if (!ufMesh) return { drawn: [] as DrawnFeature[], fitReady: false }
      const projection = geoEqualEarth().fitSize([width, height], ufMesh)
      const path = geoPath(projection)

      // City / Bairro tabs: national municipality choropleth + UF outlines.
      if (brazilGrain === 'cities') {
        if (!brazilMunMesh) {
          return { drawn: [] as DrawnFeature[], fitReady: false }
        }
        const multi = new Set(neighborhoodCities.map((c) => c.code))
        const items: DrawnFeature[] = brazilMunMesh.features.map((f) => {
          const code = f.properties.id
          const row = cityByCode.get(code)
          const uf = ufFromCityCode(code) ?? row?.area ?? ''
          return {
            id: code,
            d: path(f) ?? '',
            row,
            label: row ? cityDisplayName(row, lang) : code,
            pick: { kind: 'city', uf, cityCode: code },
            multiZone: multi.has(code),
          }
        })
        // State borders on top so the combined UF + município view reads clearly.
        for (const f of ufMesh.features) {
          const uf = f.properties.uf
          items.push({
            id: `__uf-${uf}`,
            d: path(f) ?? '',
            row: undefined,
            label: uf,
            pick: { kind: 'uf', uf },
          })
        }
        return { drawn: items, fitReady: true }
      }

      const items: DrawnFeature[] = ufMesh.features.map((f) => {
        const uf = f.properties.uf
        const row = areaByUf.get(uf)
        return {
          id: uf,
          d: path(f) ?? '',
          row,
          label: row ? cityDisplayName(row, lang) : uf,
          pick: { kind: 'uf', uf },
        }
      })
      return { drawn: items, fitReady: true }
    }

    if (focus.level === 'uf') {
      if (!munMesh) return { drawn: [] as DrawnFeature[], fitReady: false }
      const projection = geoEqualEarth().fitSize([width, height], munMesh)
      const path = geoPath(projection)
      const multi = new Set(neighborhoodCities.map((c) => c.code))
      const items: DrawnFeature[] = munMesh.features.map((f) => {
        const code = f.properties.id
        const row = cityByCode.get(code)
        return {
          id: code,
          d: path(f) ?? '',
          row,
          label: row ? cityDisplayName(row, lang) : code,
          pick: { kind: 'city', uf: focus.uf, cityCode: code },
          // Emphasize cities that drill into a neighborhood map.
          multiZone: multi.has(code),
        }
      })
      return { drawn: items, fitReady: true }
    }

    // City → neighborhoods at TSE voting-local centroids (real geography).
    if (!cityFeature) return { drawn: [] as DrawnFeature[], fitReady: false }
    const pad = Math.max(16, Math.round(Math.min(width, height) * 0.04))
    const projection = geoEqualEarth().fitExtent(
      [
        [pad, pad],
        [width - pad, height - pad],
      ],
      cityFeature,
    )
    const path = geoPath(projection)
    const local = suburbsForCity(suburbs, focus.cityCode)
    const cityRow = cityByCode.get(focus.cityCode)
    const outlineD = path(cityFeature) ?? ''

    if (local.length <= 1) {
      const row = local[0] ?? cityRow
      return {
        drawn: [
          {
            id: row?.code ?? focus.cityCode,
            d: outlineD,
            row,
            label: row ? cityDisplayName(row, lang) : focus.cityCode,
            pick: row?.level === 'suburb'
              ? { kind: 'suburb', suburbCode: row.code }
              : { kind: 'background' },
          },
        ] as DrawnFeature[],
        fitReady: true,
      }
    }

    const [[x0, y0], [x1, y1]] = path.bounds(cityFeature)
    const cx = (x0 + x1) / 2
    const cy = (y0 + y1) / 2
    const geoPts = local.filter((s) => s.lat != null && s.lon != null)
    const items: DrawnFeature[] = [
      {
        id: `__outline-${focus.cityCode}`,
        d: outlineD,
        row: undefined,
        label: cityRow ? cityDisplayName(cityRow, lang) : focus.cityCode,
        pick: { kind: 'background' },
      },
    ]

    if (geoPts.length >= Math.max(2, Math.ceil(local.length * 0.5))) {
      // Geographic placement from TSE lat/lon centroids.
      let maxV = 1
      for (const s of geoPts) {
        maxV = Math.max(maxV, s.y2026?.totalValid ?? 0)
      }
      for (const sub of local) {
        let cxp = cx
        let cyp = cy
        if (sub.lat != null && sub.lon != null) {
          const pt = projection([sub.lon, sub.lat])
          if (pt) {
            cxp = pt[0]
            cyp = pt[1]
          }
        } else {
          // Rare missing coords: nudge near mun centroid so the tip still works.
          const [gx, gy] = geoCentroid(cityFeature)
          const fall = projection([gx, gy]) ?? [cx, cy]
          cxp = fall[0]
          cyp = fall[1]
        }
        const votes = sub.y2026?.totalValid ?? 0
        const t = Math.sqrt(votes / maxV)
        const r = 5 + t * 12
        items.push({
          id: sub.code,
          d: '',
          row: sub,
          label: cityDisplayName(sub, lang),
          pick: { kind: 'suburb', suburbCode: sub.code },
          circle: { cx: cxp, cy: cyp, r },
        })
      }
      return { drawn: items, fitReady: true }
    }

    // Fallback grid only when coords are mostly missing.
    const span = Math.max(x1 - x0, y1 - y0, 40)
    const n = local.length
    const cols = Math.ceil(Math.sqrt(n))
    const rowsN = Math.ceil(n / cols)
    const cell = (span * 0.72) / Math.max(cols, rowsN)
    const r = Math.max(5, Math.min(18, cell * 0.38))
    local.forEach((sub, i) => {
      const col = i % cols
      const rowI = Math.floor(i / cols)
      const ox = (col - (cols - 1) / 2) * cell
      const oy = (rowI - (rowsN - 1) / 2) * cell
      const [gx, gy] = geoCentroid(cityFeature)
      const [pcx, pcy] = projection([gx, gy]) ?? [cx, cy]
      items.push({
        id: sub.code,
        d: '',
        row: sub,
        label: cityDisplayName(sub, lang),
        pick: { kind: 'suburb', suburbCode: sub.code },
        circle: { cx: pcx + ox, cy: pcy + oy, r },
      })
    })
    return { drawn: items, fitReady: true }
  }, [
    focus,
    brazilGrain,
    width,
    height,
    byNumeric,
    ufMesh,
    munMesh,
    brazilMunMesh,
    cityFeature,
    areaByUf,
    cityByCode,
    suburbs,
    neighborhoodCities,
    lang,
  ])

  const canGoBack = focus.level !== 'world'

  return (
    <div
      ref={wrapRef}
      className="map-wrap relative w-full"
      // Clear when leaving the map; tip is portaled, so relatedTarget check
      // keeps the × reachable.
      onMouseLeave={onMapMouseLeave}
    >
      {canGoBack ? (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="lang-btn control px-3 py-1.5 text-sm font-semibold"
            onClick={() => {
              clearTip()
              onBack()
            }}
          >
            ← {t('mapBack', lang)}
          </button>
          <span className="text-xs text-[var(--ink-muted)]">
            {focusLabel(focus, areas, cities, lang, brazilGrain)}
          </span>
        </div>
      ) : null}

      <div className={`map-stage${view.k > 1.001 ? ' is-zoomed' : ''}`}>
        <div
          className="map-zoom-controls"
          role="group"
          aria-label={t('mapZoomIn', lang)}
        >
          <button
            type="button"
            className="map-zoom-btn"
            aria-label={t('mapZoomIn', lang)}
            title={t('mapZoomIn', lang)}
            disabled={view.k >= ZOOM_MAX - 0.001}
            onClick={zoomIn}
          >
            +
          </button>
          <button
            type="button"
            className="map-zoom-btn"
            aria-label={t('mapZoomOut', lang)}
            title={t('mapZoomOut', lang)}
            disabled={view.k <= ZOOM_MIN + 0.001}
            onClick={zoomOut}
          >
            −
          </button>
          <button
            type="button"
            className="map-zoom-btn map-zoom-btn--reset"
            aria-label={t('mapZoomReset', lang)}
            title={t('mapZoomReset', lang)}
            disabled={view.k <= ZOOM_MIN + 0.001}
            onClick={zoomReset}
          >
            1×
          </button>
        </div>

        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={t('map', lang)}
          className={view.k > 1.001 ? 'cursor-grab' : undefined}
          onPointerDown={onStagePointerDown}
          onPointerMove={onStagePointerMove}
          onPointerUp={endStageDrag}
          onPointerCancel={endStageDrag}
        >
          <rect
            width={width}
            height={height}
            fill="transparent"
            className={
              canGoBack || highlightId || view.k > 1.001
                ? 'cursor-pointer'
                : undefined
            }
            onClick={() => {
              if (suppressClickRef.current) {
                suppressClickRef.current = false
                return
              }
              clearTip()
              onPick({ kind: 'background' })
            }}
          />
          {!fitReady && geoLoading ? (
            <text
              x={width / 2}
              y={height / 2}
              textAnchor="middle"
              className="fill-[var(--ink-muted)] text-sm"
            >
              {t('mapLoading', lang)}
            </text>
          ) : null}
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
        {drawn.map((f) => {
          const value = f.row ? metricValue(f.row, metric) : null
          let fill = NO_DATA_FILL
          if (f.id.startsWith('__outline-')) {
            fill = 'var(--paper-deep)'
          } else if (f.row) {
            fill = value != null ? colorize(value) : PENDING_FILL
          }
          const isHi = !!f.row && highlightId === f.id
          if (f.circle) {
            return (
              <circle
                key={f.id}
                data-map-id={f.id}
                cx={f.circle.cx}
                cy={f.circle.cy}
                r={f.circle.r}
                fill={fill}
                stroke={isHi ? 'var(--map-stroke-hi)' : 'var(--ink)'}
                strokeOpacity={isHi ? 1 : 0.35}
                strokeWidth={isHi ? 2.25 : 1}
                className="cursor-pointer transition-[stroke-width] duration-200"
                onMouseEnter={(e) => {
                  if (!f.row) return
                  showTipAt(e, f.label, f.row)
                }}
                onMouseMove={(e) => {
                  if (!f.row) return
                  showTipAt(e, f.label, f.row)
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  handleFeatureClick(e, f)
                }}
              />
            )
          }
          const isUfOutline =
            brazilGrain === 'cities' &&
            focus.level === 'brazil' &&
            f.id.startsWith('__uf-')
          const isCityOutline = f.id.startsWith('__outline-')
          return (
            <path
              key={f.id}
              data-map-id={f.id}
              d={f.d}
              fill={
                isUfOutline
                  ? 'none'
                  : isCityOutline
                    ? 'var(--paper-deep)'
                    : fill
              }
              fillOpacity={isCityOutline ? 0.85 : 1}
              stroke={
                isHi
                  ? 'var(--map-stroke-hi)'
                  : isUfOutline || isCityOutline
                    ? 'var(--ink)'
                    : 'var(--map-stroke)'
              }
              strokeOpacity={isUfOutline ? 0.7 : isCityOutline ? 0.55 : 1}
              strokeWidth={
                isHi
                  ? 1.6
                  : isUfOutline
                    ? 1.15
                    : isCityOutline
                      ? 1.4
                      : f.multiZone
                        ? 1.15
                        : focus.level === 'world'
                          ? 0.4
                          : 0.55
              }
              className={
                f.pick.kind !== 'background' || canGoBack
                  ? 'cursor-pointer transition-[stroke-width] duration-200'
                  : ''
              }
              onMouseEnter={(e) => {
                if (!f.row) return
                showTipAt(e, f.label, f.row)
              }}
              onMouseMove={(e) => {
                if (!f.row) return
                showTipAt(e, f.label, f.row)
              }}
              onClick={(e) => {
                e.stopPropagation()
                handleFeatureClick(e, f)
              }}
            />
          )
        })}
          </g>
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--ink-muted)]">
        <Legend
          metric={metric}
          mode={legendMode}
          lang={lang}
          extent={legendExtent}
        />
      </div>

      {tip
        ? createPortal(
            <div
              ref={tipRef}
              className="app-tip app-tip--fixed app-tip--map app-tip--map-open"
              role="status"
              style={{ left: tip.x, top: tip.y }}
              onMouseLeave={(e) => {
                if (
                  e.relatedTarget instanceof Node &&
                  wrapRef.current?.contains(e.relatedTarget)
                ) {
                  return
                }
                clearTip()
              }}
            >
              <div className="app-tip-body">
                <span className="app-tip-title">{tip.title}</span>
                <span className="app-tip-meta">
                  {t(metric, lang)}:{' '}
                  {formatMetricValue(
                    metricValue(tip.row, metric),
                    metric,
                    lang,
                  )}
                </span>
                {tip.row.y2026 && metric !== 'leader2022' ? (
                  <span className="app-tip-meta-muted">
                    {t('lula', lang)} {fmtPct(tip.row.y2026.lulaPct, lang)} ·{' '}
                    {t('fBolsonaro', lang)}{' '}
                    {fmtPct(tip.row.y2026.bolsonaroPct, lang)}
                  </span>
                ) : tip.row.y2022 &&
                  (metric === 'leader2022' ||
                    metric === 'lulaPct2022' ||
                    metric === 'bolsonaroPct2022') ? (
                  <span className="app-tip-meta-muted">
                    {t('lula', lang)} {fmtPct(tip.row.y2022.lulaPct, lang)} ·{' '}
                    {t('jBolsonaro', lang)}{' '}
                    {fmtPct(tip.row.y2022.bolsonaroPct, lang)}
                  </span>
                ) : tip.row.status === 'pending' ? (
                  <span className="app-tip-meta-muted">
                    {t('pendingHint', lang)}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                className="app-tip-close"
                aria-label={t('mapTipClose', lang)}
                onClick={(e) => {
                  e.stopPropagation()
                  clearTip()
                }}
              >
                ×
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

function focusLabel(
  focus: MapFocus,
  areas: CityResult[],
  cities: CityResult[],
  lang: Lang,
  brazilGrain: 'ufs' | 'cities' = 'ufs',
): string {
  if (focus.level === 'brazil') {
    if (brazilGrain === 'cities') {
      return `${t('Brazil', lang)} · ${t('mapGrainCities', lang)}`
    }
    return `${t('Brazil', lang)} · ${t('mapGrainStates', lang)}`
  }
  if (focus.level === 'uf') {
    const area = areas.find((a) => a.code === focus.uf)
    const name = area ? cityDisplayName(area, lang) : focus.uf
    return `${name} · ${t('mapGrainCities', lang)}`
  }
  if (focus.level === 'city') {
    const city = cities.find((c) => c.code === focus.cityCode)
    const name = city ? cityDisplayName(city, lang) : focus.cityCode
    return `${name} · ${t('mapGrainNeighborhoods', lang)}`
  }
  return ''
}

function Legend({
  metric,
  mode,
  lang,
  extent,
}: {
  metric: MapMetric
  mode: ReturnType<typeof legendModeForMetric>
  lang: Lang
  extent: [number, number]
}) {
  if (mode === 'leader') {
    return (
      <>
        <span className="font-medium text-[var(--ink)]">{t(metric, lang)}</span>
        <span
          className="inline-block h-2.5 w-28 rounded-sm"
          style={{
            background: `linear-gradient(90deg, ${BOLSONARO_COLOR}, ${BOLSONARO_COLOR_LIGHT}, #E8EDE8, ${LULA_COLOR_LIGHT}, ${LULA_COLOR})`,
          }}
        />
        <span>{t('legendLeaderBolso', lang)}</span>
        <span aria-hidden>·</span>
        <span>{t('legendLeaderLula', lang)}</span>
      </>
    )
  }

  if (mode === 'diverging') {
    return (
      <>
        <span className="font-medium text-[var(--ink)]">{t(metric, lang)}</span>
        <span
          className="inline-block h-2.5 w-28 rounded-sm"
          style={{
            background: `linear-gradient(90deg, ${BOLSONARO_COLOR}, #E8EDE8, ${LULA_COLOR})`,
          }}
        />
        <span>{t('legendBolso', lang)}</span>
        <span aria-hidden>·</span>
        <span>{t('legendLula', lang)}</span>
      </>
    )
  }

  const from =
    mode === 'lula'
      ? '#F7F0F0'
      : mode === 'votes'
        ? VOTES_COLOR_LIGHT
        : mode === 'other'
          ? OTHER_COLOR_LIGHT
          : mode === 'noValid'
            ? NO_VALID_VOTE_COLOR_LIGHT
            : '#EEF3F9'
  const to =
    mode === 'lula'
      ? LULA_COLOR
      : mode === 'votes'
        ? VOTES_COLOR
        : mode === 'other'
          ? OTHER_COLOR
          : mode === 'noValid'
            ? NO_VALID_VOTE_COLOR
            : BOLSONARO_COLOR
  const [lo, hi] = extent

  return (
    <>
      <span className="font-medium text-[var(--ink)]">{t(metric, lang)}</span>
      <span
        className="inline-block h-2.5 w-28 rounded-sm"
        style={{ background: `linear-gradient(90deg, ${from}, ${to})` }}
      />
      <span>{formatMetricValue(lo, metric, lang)}</span>
      <span aria-hidden>→</span>
      <span>{formatMetricValue(hi, metric, lang)}</span>
    </>
  )
}
