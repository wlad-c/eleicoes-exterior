import { scaleDiverging, scaleSequential } from 'd3-scale'
import { metricValue } from './format'
import type { CountryResult, MapMetric } from '../types'

/**
 * HARD RULE (do not invert):
 * - Lula = red
 * - Bolsonaro = blue
 * Use these everywhere (bars, map, legend, accents).
 */
export const LULA_COLOR = '#C62828'
export const BOLSONARO_COLOR = '#1565C0'
export const LULA_COLOR_DARK = '#EF5350'
export const BOLSONARO_COLOR_DARK = '#64B5F6'
export const SWING_NEUTRAL = '#E8EDE8'

/** Darkest diverging heatmap shade is reached at ±this many pp (outliers clamp). */
export const DIVERGING_PP_CAP = 10

export const PENDING_FILL = 'var(--map-pending)'
export const NO_DATA_FILL = 'var(--map-nodata)'

type ScaleKind = 'divergingLB' | 'lulaSeq' | 'bolsoSeq'

function scaleKind(metric: MapMetric): ScaleKind {
  switch (metric) {
    case 'lulaChange':
    case 'swingToLula':
      return 'divergingLB'
    case 'bolsonaroChange':
      // positive Bolsonaro change → blue (inverted below)
      return 'divergingLB'
    case 'lulaPct2026':
    case 'lulaPct2022':
      return 'lulaSeq'
    case 'bolsonaroPct2026':
    case 'bolsonaroPct2022':
      return 'bolsoSeq'
  }
}

function isInverted(metric: MapMetric): boolean {
  return metric === 'bolsonaroChange'
}

function lerpColor(a: string, b: string, t: number): string {
  const ca = hexToRgb(a)
  const cb = hexToRgb(b)
  const r = Math.round(ca.r + (cb.r - ca.r) * t)
  const g = Math.round(ca.g + (cb.g - ca.g) * t)
  const bl = Math.round(ca.b + (cb.b - ca.b) * t)
  return `rgb(${r},${g},${bl})`
}

function hexToRgb(hex: string) {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

function divergingScale() {
  return scaleDiverging<string>()
    .domain([-DIVERGING_PP_CAP, 0, DIVERGING_PP_CAP])
    .clamp(true)
    .interpolator((t) => {
      if (t < 0.5) {
        const u = t * 2
        return lerpColor(BOLSONARO_COLOR, SWING_NEUTRAL, u)
      }
      const u = (t - 0.5) * 2
      return lerpColor(SWING_NEUTRAL, LULA_COLOR, u)
    })
}

function sequentialScale(max: number, toward: 'lula' | 'bolso') {
  const hi = toward === 'lula' ? LULA_COLOR : BOLSONARO_COLOR
  const lo = toward === 'lula' ? '#F7F0F0' : '#EEF3F9'
  return scaleSequential<string>()
    .domain([0, Math.max(max, 1)])
    .interpolator((t) => lerpColor(lo, hi, t))
}

export function extentForMetric(
  countries: CountryResult[],
  metric: MapMetric,
): [number, number] {
  const vals: number[] = []
  for (const c of countries) {
    const v = metricValue(c, metric)
    if (v != null && !Number.isNaN(v)) vals.push(v)
  }
  if (vals.length === 0) return [0, 1]
  return [Math.min(...vals), Math.max(...vals)]
}

export function makeMetricColorizer(
  metric: MapMetric,
  countries: CountryResult[],
): (value: number | null) => string {
  const [, hi] = extentForMetric(countries, metric)
  const kind = scaleKind(metric)
  const invert = isInverted(metric)

  if (kind === 'divergingLB') {
    const scale = divergingScale()
    return (value) => {
      if (value == null) return PENDING_FILL
      return scale(invert ? -value : value)
    }
  }

  if (kind === 'lulaSeq') {
    const scale = sequentialScale(Math.max(hi, 1), 'lula')
    return (value) => (value == null ? PENDING_FILL : scale(value))
  }

  const scale = sequentialScale(Math.max(hi, 1), 'bolso')
  return (value) => (value == null ? PENDING_FILL : scale(value))
}

export function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('rgb(')) {
    return color.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`)
  }
  if (color.startsWith('#')) {
    const { r, g, b } = hexToRgb(color)
    return `rgba(${r},${g},${b},${alpha})`
  }
  return color
}

export type LegendMode = 'diverging' | 'lula' | 'bolso'

export function legendModeForMetric(metric: MapMetric): LegendMode {
  const kind = scaleKind(metric)
  if (kind === 'divergingLB') return 'diverging'
  if (kind === 'lulaSeq') return 'lula'
  return 'bolso'
}
