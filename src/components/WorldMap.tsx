import { geoNaturalEarth1, geoPath, geoCentroid } from 'd3-geo'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { feature } from 'topojson-client'
import type { Topology, GeometryCollection } from 'topojson-specification'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import worldAtlas from 'world-atlas/countries-110m.json'
import {
  BOLSONARO_COLOR,
  BOLSONARO_COLOR_LIGHT,
  LULA_COLOR,
  LULA_COLOR_LIGHT,
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
  fetchCityFeature,
  fetchUfMunicipalityCollection,
  suburbsForCity,
  type MapFocus,
  type MapPick,
} from '../lib/brazilGeo'
import { t } from '../lib/i18n'
import { numericIdForIso3 } from '../lib/iso'
import { useMediaQuery } from '../lib/useMediaQuery'
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
  const [width, setWidth] = useState(960)
  const [tip, setTip] = useState<Tip | null>(null)
  /** Touch synthesizes mouseenter before click — skip hover tips there. */
  const canHover = useMediaQuery('(hover: hover) and (pointer: fine)')
  const ufMesh = useMemo(() => brazilUfCollection(), [])
  const [munMesh, setMunMesh] = useState<FeatureCollection<
    Geometry,
    { id: string }
  > | null>(null)
  const [cityFeature, setCityFeature] = useState<Feature<
    Geometry,
    { id: string }
  > | null>(null)
  const [geoLoading, setGeoLoading] = useState(false)

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
  }, [focus])

  useEffect(() => {
    if (!tip) return
    const onPointerDown = (e: PointerEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return
      setTip(null)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTip(null)
    }
    const onScroll = () => setTip(null)
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    // Capture: table/filter scrolls are often nested.
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [tip])

  const showTipAt = useCallback(
    (
      e: { clientX: number; clientY: number },
      title: string,
      row: VoteLike,
    ) => {
      const rect = wrapRef.current?.getBoundingClientRect()
      if (!rect) return
      setTip({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        title,
        row,
      })
    },
    [],
  )

  const clearTip = useCallback(() => setTip(null), [])

  /** Touch synthesizes mouseenter then never mouseleave — keep tip until dismiss. */
  const handleFeatureClick = useCallback(
    (e: ReactMouseEvent, f: DrawnFeature) => {
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

  const height = Math.round(width * (width < 520 ? 0.58 : 0.48))

  const neighborhoodCities = useMemo(
    () => citiesWithNeighborhoods(cities, suburbs),
    [cities, suburbs],
  )

  const colorRows: VoteLike[] = useMemo(() => {
    if (focus.level === 'brazil') {
      return brazilGrain === 'cities' ? neighborhoodCities : areas
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

  const colorize = useMemo(
    () => makeMetricColorizer(metric, colorRows),
    [metric, colorRows],
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
      const projection = geoNaturalEarth1().fitSize([width, height], fc)
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
      const projection = geoNaturalEarth1().fitSize([width, height], ufMesh)
      const path = geoPath(projection)

      // City / Bairro tabs: real map of municipalities that have zona/bairro data.
      if (brazilGrain === 'cities') {
        const items: DrawnFeature[] = ufMesh.features.map((f) => {
          const uf = f.properties.uf
          return {
            id: `__uf-${uf}`,
            d: path(f) ?? '',
            row: undefined,
            label: uf,
            pick: { kind: 'uf', uf },
          }
        })
        const withCoords = neighborhoodCities.filter(
          (c) => c.lat != null && c.lon != null,
        )
        // Marker size from vote volume so capitals read larger.
        let maxV = 1
        for (const c of withCoords) {
          maxV = Math.max(maxV, c.y2026?.totalValid ?? 0)
        }
        for (const c of withCoords) {
          const pt = projection([c.lon as number, c.lat as number])
          if (!pt) continue
          const votes = c.y2026?.totalValid ?? 0
          const t = Math.sqrt(votes / maxV)
          const r = 3.5 + t * 10
          items.push({
            id: c.code,
            d: '',
            row: c,
            label: cityDisplayName(c, lang),
            pick: {
              kind: 'city',
              uf: c.area || c.code.slice(0, 2),
              cityCode: c.code,
            },
            circle: { cx: pt[0], cy: pt[1], r },
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
      const projection = geoNaturalEarth1().fitSize([width, height], munMesh)
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
    const projection = geoNaturalEarth1().fitExtent(
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
      // Clear when the pointer leaves the whole map chrome (incl. tip).
      // Per-path mouseleave would dismiss before the tip × can be pressed.
      onMouseLeave={clearTip}
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

      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={t('map', lang)}
        className="w-full overflow-visible"
      >
        <rect
          width={width}
          height={height}
          fill="transparent"
          className={
            canGoBack || highlightId ? 'cursor-pointer' : undefined
          }
          onClick={() => {
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
                  if (!canHover || !f.row) return
                  showTipAt(e, f.label, f.row)
                }}
                onMouseMove={(e) => {
                  if (!canHover || !f.row) return
                  showTipAt(e, f.label, f.row)
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  handleFeatureClick(e, f)
                }}
              />
            )
          }
          const isUfBackdrop =
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
                isCityOutline
                  ? 'var(--paper-deep)'
                  : isUfBackdrop
                    ? 'var(--map-nodata)'
                    : fill
              }
              fillOpacity={isCityOutline ? 0.85 : isUfBackdrop ? 0.55 : 1}
              stroke={
                isHi
                  ? 'var(--map-stroke-hi)'
                  : isCityOutline
                    ? 'var(--ink)'
                    : 'var(--map-stroke)'
              }
              strokeOpacity={isCityOutline ? 0.55 : 1}
              strokeWidth={
                isHi
                  ? 1.6
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
                if (!canHover || !f.row) return
                showTipAt(e, f.label, f.row)
              }}
              onMouseMove={(e) => {
                if (!canHover || !f.row) return
                showTipAt(e, f.label, f.row)
              }}
              onClick={(e) => {
                e.stopPropagation()
                handleFeatureClick(e, f)
              }}
            />
          )
        })}
      </svg>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--ink-muted)]">
        <Legend metric={metric} mode={legendMode} lang={lang} />
      </div>

      {tip && (
        <div
          className="app-tip app-tip--map app-tip--map-open"
          role="status"
          style={{
            left: Math.min(tip.x + 12, width - 270),
            top: Math.max(8, tip.y - 8),
          }}
        >
          <div className="app-tip-body">
            <span className="app-tip-title">{tip.title}</span>
            <span className="app-tip-meta">
              {t(metric, lang)}:{' '}
              {formatMetricValue(metricValue(tip.row, metric), metric, lang)}
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
        </div>
      )}
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
      return lang === 'pt'
        ? 'Brasil · cidades com bairros'
        : 'Brazil · cities with neighborhoods'
    }
    return lang === 'pt' ? 'Brasil · UFs' : 'Brazil · states'
  }
  if (focus.level === 'uf') {
    const area = areas.find((a) => a.code === focus.uf)
    const name = area ? cityDisplayName(area, lang) : focus.uf
    return `${name} · ${lang === 'pt' ? 'municípios' : 'municipalities'}`
  }
  if (focus.level === 'city') {
    const city = cities.find((c) => c.code === focus.cityCode)
    const name = city ? cityDisplayName(city, lang) : focus.cityCode
    return `${name} · ${lang === 'pt' ? 'bairros (zonas)' : 'neighborhoods (zones)'}`
  }
  return ''
}

function Legend({
  metric,
  mode,
  lang,
}: {
  metric: MapMetric
  mode: ReturnType<typeof legendModeForMetric>
  lang: Lang
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

  const from = mode === 'lula' ? '#F7F0F0' : '#EEF3F9'
  const to = mode === 'lula' ? LULA_COLOR : BOLSONARO_COLOR

  return (
    <>
      <span className="font-medium text-[var(--ink)]">{t(metric, lang)}</span>
      <span
        className="inline-block h-2.5 w-28 rounded-sm"
        style={{ background: `linear-gradient(90deg, ${from}, ${to})` }}
      />
      <span>{t('legendLow', lang)}</span>
      <span aria-hidden>·</span>
      <span>{t('legendHigh', lang)}</span>
    </>
  )
}
