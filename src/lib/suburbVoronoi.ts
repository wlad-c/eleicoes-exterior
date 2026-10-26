import { Delaunay } from 'd3-delaunay'

export type ProjectedSite = {
  id: string
  x: number
  y: number
}

/**
 * Build planar Voronoi cells for projected suburb centroids.
 * Cells are bounded by `bounds` (typically a padded city bbox); callers should
 * clip the resulting paths to the municipality outline (e.g. SVG clipPath).
 *
 * Returns null when there are fewer than two usable sites (caller keeps bubbles
 * / solid fill). Near-duplicate sites are nudged so Delaunay stays stable.
 */
export function suburbVoronoiCells(
  sites: ProjectedSite[],
  bounds: [number, number, number, number],
): { id: string; d: string }[] | null {
  if (sites.length < 2) return null

  const points: ProjectedSite[] = sites.map((s) => ({ ...s }))
  // Nudge exact duplicates a fraction of a pixel so Delaunay does not collapse.
  const seen = new Map<string, number>()
  for (const p of points) {
    const key = `${p.x.toFixed(3)},${p.y.toFixed(3)}`
    const n = seen.get(key) ?? 0
    seen.set(key, n + 1)
    if (n > 0) {
      p.x += n * 0.35
      p.y += n * 0.35
    }
  }

  const delaunay = Delaunay.from(
    points,
    (p) => p.x,
    (p) => p.y,
  )
  const voronoi = delaunay.voronoi(bounds)
  const cells: { id: string; d: string }[] = []
  for (let i = 0; i < points.length; i++) {
    const d = voronoi.renderCell(i)
    if (!d) continue
    cells.push({ id: points[i].id, d })
  }
  return cells.length >= 2 ? cells : null
}
