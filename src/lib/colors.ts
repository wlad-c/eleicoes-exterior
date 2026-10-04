import { scaleDiverging, scaleSequential } from 'd3-scale'
import type { MapMetric } from '../types'

/** Lula green ↔ neutral ↔ Bolsonaro blue for swing / margin */
const swingScale = scaleDiverging<string>()
  .domain([-20, 0, 20])
  .interpolator((t) => {
    // t: 0 = Bolsonaro, 0.5 = neutral, 1 = Lula
    if (t < 0.5) {
      const u = t * 2
      return lerpColor('#1E4D8C', '#E8EDE8', u)
    }
    const u = (t - 0.5) * 2
    return lerpColor('#E8EDE8', '#1B7A4E', u)
  })

const lulaPctScale = scaleSequential<string>()
  .domain([0, 70])
  .interpolator((t) => lerpColor('#F2F5F0', '#1B7A4E', t))

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
  if (value == null) return '#C5CEC6'
  if (metric === 'lulaPct2026') return lulaPctScale(value)
  if (metric === 'bolsonaroSwing') {
    // positive bolsonaro swing → blue
    return swingScale(-value)
  }
  return swingScale(value)
}

export const PENDING_FILL = 'var(--map-pending)'
export const NO_DATA_FILL = 'var(--map-nodata)'
