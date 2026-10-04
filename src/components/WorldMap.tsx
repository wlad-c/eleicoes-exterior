import { geoNaturalEarth1, geoPath } from 'd3-geo'
import { useEffect, useMemo, useRef, useState } from 'react'
import { feature } from 'topojson-client'
import type { Topology, GeometryCollection } from 'topojson-specification'
import type { FeatureCollection, Geometry } from 'geojson'
import worldAtlas from 'world-atlas/countries-110m.json'
import { colorForMetric, NO_DATA_FILL, PENDING_FILL } from '../lib/colors'
import { countryName, fmtPp, fmtPct, metricValue } from '../lib/format'
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

export function WorldMap({ countries, metric, lang, highlightId, onSelect }: Props) {
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

  const height = Math.round(width * 0.48)

  const byNumeric = useMemo(() => {
    const m = new Map<string, CountryResult>()
    for (const c of countries) {
      const nid = numericIdForIso3(c.iso3)
      if (nid) m.set(String(Number(nid)), c)
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
        {features.map((f) => {
          const id = String(f.id ?? '')
          const c = byNumeric.get(id)
          const d = path(f) ?? ''
          const value = c ? metricValue(c, metric) : null
          let fill = NO_DATA_FILL
          if (c) {
            fill =
              c.status === 'reported' && value != null
                ? colorForMetric(metric, value)
                : PENDING_FILL
          }
          const isHi = c && highlightId === c.id
          return (
            <path
              key={id}
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
                onSelect(c.id)
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
        <span className="font-medium text-[var(--ink)]">{t('mapMetric', lang)}:</span>
        <LegendSwatch from="#1E4D8C" to="#1B7A4E" />
        <span>{t('legendBolso', lang)}</span>
        <span aria-hidden>·</span>
        <span>{t('legendLula', lang)}</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: PENDING_FILL }} />
          {t('legendPending', lang)}
        </span>
      </div>

      {tip && (
        <div
          className="pointer-events-none absolute z-20 max-w-[240px] rounded-md px-3 py-2 text-left text-xs shadow-lg"
          style={{
            left: Math.min(tip.x + 12, width - 250),
            top: Math.max(8, tip.y - 8),
            background: 'var(--tip-bg)',
            color: 'var(--tip-fg)',
          }}
        >
          <div className="font-semibold">{countryName(tip.country, lang)}</div>
          {tip.country.status === 'reported' && tip.country.y2026 && tip.country.swing ? (
            <>
              <div className="mt-1 opacity-90">
                {t('lula', lang)} {fmtPct(tip.country.y2026.lulaPct, lang)} ·{' '}
                {t('fBolsonaro', lang)} {fmtPct(tip.country.y2026.bolsonaroPct, lang)}
              </div>
              <div className="mt-0.5 opacity-90">
                {t('marginSwing', lang)}: {fmtPp(tip.country.swing.marginPp, lang)}
              </div>
            </>
          ) : (
            <div className="mt-1 opacity-80">{t('pendingHint', lang)}</div>
          )}
        </div>
      )}
    </div>
  )
}

function LegendSwatch({ from, to }: { from: string; to: string }) {
  return (
    <span
      className="inline-block h-2.5 w-28 rounded-sm"
      style={{ background: `linear-gradient(90deg, ${from}, #E8EDE8, ${to})` }}
    />
  )
}
