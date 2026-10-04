import { scaleDiverging, scaleSequential } from 'd3-scale'
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
export const SWING_NEUTRAL_DARK = '#2A3530'

/** Bolsonaro blue ↔ neutral ↔ Lula red for swing / margin */
const swingScale = scaleDiverging<string>()
  .domain([-20, 0, 20])
  .interpolator((t) => {
    // t: 0 = Bolsonaro (blue), 0.5 = neutral, 1 = Lula (red)
    if (t < 0.5) {
      const u = t * 2
      return lerpColor(BOLSONARO_COLOR, SWING_NEUTRAL, u)
    }
    const u = (t - 0.5) * 2
    return lerpColor(SWING_NEUTRAL, LULA_COLOR, u)
  })

const lulaPctScale = scaleSequential<string>()
  .domain([0, 70])
  .interpolator((t) => lerpColor('#F7F0F0', LULA_COLOR, t))

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

export function colorForMetric(metric: MapMetric, value: number | null): string {
  if (value == null) return PENDING_FILL
  if (metric === 'lulaPct2026') return lulaPctScale(value)
  if (metric === 'bolsonaroSwing') {
    // positive bolsonaro swing → blue
    return swingScale(-value)
  }
  // positive margin / lula swing → red (toward Lula)
  return swingScale(value)
}

export const PENDING_FILL = 'var(--map-pending)'
export const NO_DATA_FILL = 'var(--map-nodata)'
