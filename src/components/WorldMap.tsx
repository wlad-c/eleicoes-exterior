import { geoNaturalEarth1, geoPath } from 'd3-geo'
import { useEffect, useMemo, useRef, useState } from 'react'
import { feature } from 'topojson-client'
import type { Topology, GeometryCollection } from 'topojson-specification'
import type { FeatureCollection, Geometry } from 'geojson'
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
  countryName,
  formatMetricValue,
  fmtPct,
  metricValue,
} from '../lib/format'
import { t } from '../lib/i18n'
import { numericIdForIso3 } from '../lib/iso'
import type { CountryResult, Lang, MapMetric } from '../types'

type Props = {
  countries: CountryResult[]
  metric: MapMetric
  lang: Lang
  highlightId: string | null
  onSelect: (id: string | null) => void
}

type Tip = {
  x: number
  y: number
  country: CountryResult
}

export function WorldMap({
  countries,
  metric,
  lang,
  highlightId,
  onSelect,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(960)
  const [tip, setTip] = useState<Tip | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setWidth(Math.max(320, Math.floor(entry.contentRect.width)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const height = Math.round(width * (width < 520 ? 0.58 : 0.48))
  const colorize = useMemo(
    () => makeMetricColorizer(metric, countries),
    [metric, countries],
  )
  const legendMode = legendModeForMetric(metric)

  const byNumeric = useMemo(() => {
    const m = new Map<string, CountryResult>()
    for (const c of countries) {
      const nid = numericIdForIso3(c.iso3)
      if (nid == null || nid === '') continue
      // world-atlas ids are often zero-padded strings ("036"); normalize
      m.set(String(Number(nid)), c)
    }
    return m
  }, [countries])

  const { path, features } = useMemo(() => {
    const topo = worldAtlas as unknown as Topology<{
      countries: GeometryCollection
    }>
    const fc = feature(topo, topo.objects.countries) as FeatureCollection<Geometry>
    const projection = geoNaturalEarth1().fitSize([width, height], fc)
    return { path: geoPath(projection), features: fc.features }
  }, [width, height])

  return (
    <div ref={wrapRef} className="map-wrap relative w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={t('map', lang)}
        className="w-full overflow-visible"
        onMouseLeave={() => {
          setTip(null)
        }}
      >
        <rect width={width} height={height} fill="transparent" />
        {features.map((f, i) => {
          const rawId = f.id
          const numericKey =
            rawId != null && rawId !== ''
              ? String(Number(rawId))
              : ''
          const c =
            numericKey && numericKey !== 'NaN'
              ? byNumeric.get(numericKey)
              : undefined
          const d = path(f) ?? ''
          const value = c ? metricValue(c, metric) : null
          let fill = NO_DATA_FILL
          if (c) {
            fill = value != null ? colorize(value) : PENDING_FILL
          }
          const isHi = c && highlightId === c.id
          return (
            <path
              key={numericKey || `geo-${i}`}
              d={d}
              fill={fill}
              stroke={isHi ? 'var(--map-stroke-hi)' : 'var(--map-stroke)'}
              strokeWidth={isHi ? 1.6 : 0.4}
              className={c ? 'cursor-pointer transition-[stroke-width] duration-200' : ''}
              onMouseEnter={(e) => {
                if (!c) return
                const rect = wrapRef.current?.getBoundingClientRect()
                if (!rect) return
                setTip({
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top,
                  country: c,
                })
              }}
              onMouseMove={(e) => {
                if (!c) return
                const rect = wrapRef.current?.getBoundingClientRect()
                if (!rect) return
                setTip({
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top,
                  country: c,
                })
              }}
              onMouseLeave={() => setTip(null)}
              onClick={() => c && onSelect(c.id)}
            />
          )
        })}
      </svg>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--ink-muted)]">
        <Legend metric={metric} mode={legendMode} lang={lang} />
      </div>

      {tip && (
        <div
          className="app-tip app-tip--map"
          style={{
            left: Math.min(tip.x + 12, width - 270),
            top: Math.max(8, tip.y - 8),
          }}
        >
          <span className="app-tip-title">
            {countryName(tip.country, lang)}
          </span>
          <span className="app-tip-meta">
            {t(metric, lang)}:{' '}
            {formatMetricValue(metricValue(tip.country, metric), metric, lang)}
          </span>
          {tip.country.status === 'reported' && tip.country.y2026 && metric !== 'leader2022' ? (
            <span className="app-tip-meta-muted">
              {t('lula', lang)} {fmtPct(tip.country.y2026.lulaPct, lang)} ·{' '}
              {t('fBolsonaro', lang)} {fmtPct(tip.country.y2026.bolsonaroPct, lang)}
            </span>
          ) : metric === 'leader2022' ||
            metric === 'lulaPct2022' ||
            metric === 'bolsonaroPct2022' ? (
            <span className="app-tip-meta-muted">
              {t('lula', lang)} {fmtPct(tip.country.y2022.lulaPct, lang)} ·{' '}
              {t('jBolsonaro', lang)}{' '}
              {fmtPct(tip.country.y2022.bolsonaroPct, lang)}
            </span>
          ) : tip.country.status === 'pending' ? (
            <span className="app-tip-meta-muted">{t('pendingHint', lang)}</span>
          ) : null}
        </div>
      )}
    </div>
  )
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
