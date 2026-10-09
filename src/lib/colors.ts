import { scaleDiverging, scaleSequential } from 'd3-scale'
import { metricValue, type VoteLike } from './format'
import type { MapMetric } from '../types'

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
/** Light end of the leader scale (just over 50%). */
export const LULA_COLOR_LIGHT = '#F0B7B7'
export const BOLSONARO_COLOR_LIGHT = '#B7D0F0'

/** Darkest diverging heatmap shade is reached at ±this many pp (outliers clamp). */
export const DIVERGING_PP_CAP = 10

export const PENDING_FILL = 'var(--map-pending)'
export const NO_DATA_FILL = 'var(--map-nodata)'

type ScaleKind = 'divergingLB' | 'leader' | 'lulaSeq' | 'bolsoSeq'

function scaleKind(metric: MapMetric): ScaleKind {
  switch (metric) {
    case 'leader2026':
    case 'leader2022':
      return 'leader'
    case 'lulaChange':
    case 'swingToLula':
      return 'divergingLB'
    case 'bolsonaroChange':
    case 'swingToBolsonaro':
      // positive Bolsonaro metrics → blue (inverted below)
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
  return metric === 'bolsonaroChange' || metric === 'swingToBolsonaro'
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

/**
 * Leader score: +winnerPct if Lula leads, −winnerPct if Bolsonaro leads, 0 on tie.
 * Colour intensity maps 50%→100% from light to dark party colour.
 */
function leaderColor(value: number): string {
  if (value === 0) return SWING_NEUTRAL
  const pct = Math.abs(value)
  const t = Math.max(0, Math.min(1, (pct - 50) / 50))
  if (value > 0) return lerpColor(LULA_COLOR_LIGHT, LULA_COLOR, t)
  return lerpColor(BOLSONARO_COLOR_LIGHT, BOLSONARO_COLOR, t)
}

function sequentialScale(max: number, toward: 'lula' | 'bolso') {
  const hi = toward === 'lula' ? LULA_COLOR : BOLSONARO_COLOR
  const lo = toward === 'lula' ? '#F7F0F0' : '#EEF3F9'
  return scaleSequential<string>()
    .domain([0, Math.max(max, 1)])
    .interpolator((t) => lerpColor(lo, hi, t))
}

export function extentForMetric(
  rows: VoteLike[],
  metric: MapMetric,
): [number, number] {
  const vals: number[] = []
  for (const c of rows) {
    const v = metricValue(c, metric)
    if (v != null && !Number.isNaN(v)) vals.push(v)
  }
  if (vals.length === 0) return [0, 1]
  return [Math.min(...vals), Math.max(...vals)]
}

export function makeMetricColorizer(
  metric: MapMetric,
  rows: VoteLike[],
): (value: number | null) => string {
  const [, hi] = extentForMetric(rows, metric)
  const kind = scaleKind(metric)
  const invert = isInverted(metric)

  if (kind === 'leader') {
    return (value) => (value == null ? PENDING_FILL : leaderColor(value))
  }

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

export type LegendMode = 'diverging' | 'leader' | 'lula' | 'bolso'

export function legendModeForMetric(metric: MapMetric): LegendMode {
  const kind = scaleKind(metric)
  if (kind === 'leader') return 'leader'
  if (kind === 'divergingLB') return 'diverging'
  if (kind === 'lulaSeq') return 'lula'
  return 'bolso'
}
