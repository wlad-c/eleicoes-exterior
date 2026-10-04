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

export const PENDING_FILL = 'var(--map-pending)'
export const NO_DATA_FILL = 'var(--map-nodata)'

type ScaleKind = 'divergingLB' | 'lulaSeq' | 'bolsoSeq' | 'intensity'

function scaleKind(metric: MapMetric): ScaleKind {
  switch (metric) {
    case 'marginSwing':
    case 'lulaSwing':
    case 'margin2026':
    case 'margin2022':
      return 'divergingLB'
    case 'bolsonaroSwing':
      // positive bolsonaro swing → blue (invert via caller)
      return 'divergingLB'
    case 'lulaPct2026':
    case 'lulaPct2022':
      return 'lulaSeq'
    case 'bolsonaroPct2026':
    case 'bolsonaroPct2022':
      return 'bolsoSeq'
    case 'votes2026':
    case 'votes2022':
      return 'intensity'
  }
}

function isInverted(metric: MapMetric): boolean {
  return metric === 'bolsonaroSwing'
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

function divergingScale(absMax: number) {
  const m = Math.max(absMax, 1)
  return scaleDiverging<string>()
    .domain([-m, 0, m])
    .interpolator((t) => {
      if (t < 0.5) {
        const u = t * 2
        return lerpColor(BOLSONARO_COLOR, SWING_NEUTRAL, u)
      }
      const u = (t - 0.5) * 2
      return lerpColor(SWING_NEUTRAL, LULA_COLOR, u)
    })
}

function sequentialScale(max: number, toward: 'lula' | 'bolso' | 'ink') {
  const hi =
    toward === 'lula' ? LULA_COLOR : toward === 'bolso' ? BOLSONARO_COLOR : '#37474F'
  const lo = toward === 'lula' ? '#F7F0F0' : toward === 'bolso' ? '#EEF3F9' : '#F0F2F1'
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
  const [lo, hi] = extentForMetric(countries, metric)
  const kind = scaleKind(metric)
  const invert = isInverted(metric)

  if (kind === 'divergingLB') {
    const absMax = Math.max(Math.abs(lo), Math.abs(hi), 1)
    const scale = divergingScale(absMax)
    return (value) => {
      if (value == null) return PENDING_FILL
      return scale(invert ? -value : value)
    }
  }

  if (kind === 'lulaSeq') {
    const scale = sequentialScale(Math.max(hi, 1), 'lula')
    return (value) => (value == null ? PENDING_FILL : scale(value))
  }

  if (kind === 'bolsoSeq') {
    const scale = sequentialScale(Math.max(hi, 1), 'bolso')
    return (value) => (value == null ? PENDING_FILL : scale(value))
  }

  // vote intensity
  const scale = sequentialScale(Math.max(hi, 1), 'ink')
  return (value) => (value == null ? PENDING_FILL : scale(value))
}

/** @deprecated prefer makeMetricColorizer for data-aware domains */
export function colorForMetric(metric: MapMetric, value: number | null): string {
  if (value == null) return PENDING_FILL
  const kind = scaleKind(metric)
  if (kind === 'lulaSeq') return sequentialScale(70, 'lula')(value)
  if (kind === 'bolsoSeq') return sequentialScale(70, 'bolso')(value)
  if (kind === 'intensity') return sequentialScale(35000, 'ink')(value)
  const scale = divergingScale(20)
  return scale(isInverted(metric) ? -value : value)
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

export type LegendMode = 'diverging' | 'lula' | 'bolso' | 'intensity'

export function legendModeForMetric(metric: MapMetric): LegendMode {
  const kind = scaleKind(metric)
  if (kind === 'divergingLB') return 'diverging'
  if (kind === 'lulaSeq') return 'lula'
  if (kind === 'bolsoSeq') return 'bolso'
  return 'intensity'
}
