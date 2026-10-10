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
/**
 * Light end of the leader scale (low plurality share).
 * Kept a step stronger than pastel so first-round ~45–50% winners
 * (Brazil) still read clearly against the map paper.
 */
export const LULA_COLOR_LIGHT = '#E57373'
export const BOLSONARO_COLOR_LIGHT = '#64B5F6'
/**
 * Same-year margin heatmaps: darkest shade at ±this many pp.
 * Matches swing/change so a ~2pp national gap (Brazil) still tints the
 * world map; overseas landslides clamp at full colour.
 */
export const DIFFERENCE_PP_CAP = 10
/** Absolute total-vote heatmap (light → dark purple). */
export const VOTES_COLOR = '#6A1B9A'
export const VOTES_COLOR_LIGHT = '#F3E5F5'
/** Other-candidate share heatmap (light → dark slate). */
export const OTHER_COLOR = '#455A64'
export const OTHER_COLOR_LIGHT = '#ECEFF1'
/** Abstention share heatmap (light → dark brown). */
export const NO_VALID_VOTE_COLOR = '#5D4037'
export const NO_VALID_VOTE_COLOR_LIGHT = '#EFEBE9'

/** Darkest diverging heatmap shade is reached at ±this many pp (outliers clamp). */
export const DIVERGING_PP_CAP = 10

export const PENDING_FILL = 'var(--map-pending)'
export const NO_DATA_FILL = 'var(--map-nodata)'

type ScaleKind =
  | 'divergingLB'
  | 'leader'
  | 'lulaSeq'
  | 'bolsoSeq'
  | 'votesSeq'
  | 'otherSeq'
  | 'noValidSeq'

function scaleKind(metric: MapMetric): ScaleKind {
  switch (metric) {
    case 'leader2026':
    case 'leader2022':
      return 'leader'
    case 'difference2026':
    case 'difference2022':
    case 'lulaChange':
    case 'swing':
      return 'divergingLB'
    case 'bolsonaroChange':
      // positive Bolsonaro change → blue (inverted below)
      return 'divergingLB'
    case 'lulaPct2026':
    case 'lulaPct2022':
    case 'lulaVotes2026':
    case 'lulaVotes2022':
      return 'lulaSeq'
    case 'bolsonaroPct2026':
    case 'bolsonaroPct2022':
    case 'bolsonaroVotes2026':
    case 'bolsonaroVotes2022':
      return 'bolsoSeq'
    case 'otherPct2026':
    case 'otherPct2022':
      return 'otherSeq'
    case 'noValidVotePct2026':
    case 'noValidVotePct2022':
    case 'noValidVotes2026':
    case 'noValidVotes2022':
      return 'noValidSeq'
    case 'votes2026':
    case 'votes2022':
      return 'votesSeq'
  }
}

function isInverted(metric: MapMetric): boolean {
  return metric === 'bolsonaroChange'
}

function isDifferenceMetric(metric: MapMetric): boolean {
  return metric === 'difference2026' || metric === 'difference2022'
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
 * Colour intensity maps share of valid votes 0%→100% (1st round winners are
 * often below 50% — e.g. Brazil ~47% — so a 50% floor washed the country out).
 */
function leaderColor(value: number): string {
  if (value === 0) return SWING_NEUTRAL
  const pct = Math.abs(value)
  const t = Math.max(0, Math.min(1, pct / 100))
  if (value > 0) return lerpColor(LULA_COLOR_LIGHT, LULA_COLOR, t)
  return lerpColor(BOLSONARO_COLOR_LIGHT, BOLSONARO_COLOR, t)
}

function sequentialScale(
  domainLo: number,
  domainHi: number,
  toward: 'lula' | 'bolso' | 'votes' | 'other' | 'noValid',
) {
  const hiColor =
    toward === 'lula'
      ? LULA_COLOR
      : toward === 'bolso'
        ? BOLSONARO_COLOR
        : toward === 'votes'
          ? VOTES_COLOR
          : toward === 'other'
            ? OTHER_COLOR
            : NO_VALID_VOTE_COLOR
  const loColor =
    toward === 'lula'
      ? '#F7F0F0'
      : toward === 'bolso'
        ? '#EEF3F9'
        : toward === 'votes'
          ? VOTES_COLOR_LIGHT
          : toward === 'other'
            ? OTHER_COLOR_LIGHT
            : NO_VALID_VOTE_COLOR_LIGHT
  let lo = domainLo
  let hi = domainHi
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    lo = 0
    hi = 1
  }
  // Identical values → solid mid tone (avoid a zero-width domain).
  if (hi <= lo) {
    hi = lo + Math.max(Math.abs(lo) * 1e-6, 1e-6)
  }
  return scaleSequential<string>()
    .domain([lo, hi])
    .clamp(true)
    .interpolator((t) => lerpColor(loColor, hiColor, t))
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
  const [lo, hi] = extentForMetric(rows, metric)
  const kind = scaleKind(metric)
  const invert = isInverted(metric)

  if (kind === 'leader') {
    return (value) => (value == null ? PENDING_FILL : leaderColor(value))
  }

  if (kind === 'divergingLB') {
    const scale = isDifferenceMetric(metric)
      ? scaleDiverging<string>()
          .domain([-DIFFERENCE_PP_CAP, 0, DIFFERENCE_PP_CAP])
          .clamp(true)
          .interpolator(divergingScale().interpolator())
      : divergingScale()
    return (value) => {
      if (value == null) return PENDING_FILL
      return scale(invert ? -value : value)
    }
  }

  // Sequential metrics stretch across the visible min→max (not fixed 0→max).
  // Absolute vote counts use log1p so a few large places don’t dominate.
  const toward =
    kind === 'lulaSeq'
      ? 'lula'
      : kind === 'votesSeq'
        ? 'votes'
        : kind === 'otherSeq'
          ? 'other'
          : kind === 'noValidSeq'
            ? 'noValid'
            : 'bolso'
  const voteCount =
    metric === 'votes2026' ||
    metric === 'votes2022' ||
    metric === 'lulaVotes2026' ||
    metric === 'lulaVotes2022' ||
    metric === 'bolsonaroVotes2026' ||
    metric === 'bolsonaroVotes2022' ||
    metric === 'noValidVotes2026' ||
    metric === 'noValidVotes2022'
  const domainLo = voteCount ? Math.log1p(Math.max(lo, 0)) : lo
  const domainHi = voteCount ? Math.log1p(Math.max(hi, 0)) : hi
  const scale = sequentialScale(domainLo, domainHi, toward)
  return (value) => {
    if (value == null) return PENDING_FILL
    return scale(voteCount ? Math.log1p(Math.max(value, 0)) : value)
  }
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

export type LegendMode =
  | 'diverging'
  | 'leader'
  | 'lula'
  | 'bolso'
  | 'votes'
  | 'other'
  | 'noValid'

export function legendModeForMetric(metric: MapMetric): LegendMode {
  const kind = scaleKind(metric)
  if (kind === 'leader') return 'leader'
  if (kind === 'divergingLB') return 'diverging'
  if (kind === 'lulaSeq') return 'lula'
  if (kind === 'votesSeq') return 'votes'
  if (kind === 'otherSeq') return 'other'
  if (kind === 'noValidSeq') return 'noValid'
  return 'bolso'
}
