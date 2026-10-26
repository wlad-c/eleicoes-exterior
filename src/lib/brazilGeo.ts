import type { Feature, FeatureCollection, Geometry, Position } from 'geojson'
import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import brazilUfs from '../data/brazil-ufs.json'
import type { CityResult } from '../types'

/**
 * IBGE malhas often ship clockwise exterior rings. d3-geo treats those as the
 * whole sphere (geodesic area ≈ 4π), which breaks fitSize / choropleths.
 */
function rewindRing(ring: Position[]): Position[] {
  return ring.slice().reverse()
}

export function rewindGeometry(geometry: Geometry): Geometry {
  if (geometry.type === 'Polygon') {
    return {
      type: 'Polygon',
      coordinates: geometry.coordinates.map(rewindRing),
    }
  }
  if (geometry.type === 'MultiPolygon') {
    return {
      type: 'MultiPolygon',
      coordinates: geometry.coordinates.map((poly) => poly.map(rewindRing)),
    }
  }
  return geometry
}

/** IBGE state code → UF abbreviation. */
export const IBGE_TO_UF: Record<string, string> = {
  '11': 'RO',
  '12': 'AC',
  '13': 'AM',
  '14': 'RR',
  '15': 'PA',
  '16': 'AP',
  '17': 'TO',
  '21': 'MA',
  '22': 'PI',
  '23': 'CE',
  '24': 'RN',
  '25': 'PB',
  '26': 'PE',
  '27': 'AL',
  '28': 'SE',
  '29': 'BA',
  '31': 'MG',
  '32': 'ES',
  '33': 'RJ',
  '35': 'SP',
  '41': 'PR',
  '42': 'SC',
  '43': 'RS',
  '50': 'MS',
  '51': 'MT',
  '52': 'GO',
  '53': 'DF',
}

export const UF_TO_IBGE: Record<string, string> = Object.fromEntries(
  Object.entries(IBGE_TO_UF).map(([ibge, uf]) => [uf, ibge]),
)

export type MapFocus =
  | { level: 'world' }
  | { level: 'brazil' }
  | { level: 'uf'; uf: string }
  | { level: 'city'; uf: string; cityCode: string }

export type MapPick =
  | { kind: 'country'; id: string }
  | { kind: 'uf'; uf: string }
  | { kind: 'city'; uf: string; cityCode: string }
  | { kind: 'suburb'; suburbCode: string }
  | { kind: 'background' }

export type MapFeatureProps = {
  id: string
  label: string
  kind: 'country' | 'uf' | 'city' | 'suburb'
}

type MunFc = FeatureCollection<Geometry, { id: string }>

let munNational: MunFc | null = null
let munNationalInflight: Promise<MunFc | null> | null = null
const munByUf = new Map<string, MunFc>()

export function brazilMunicipiosUrl(): string {
  return `${import.meta.env.BASE_URL}data/brazil-municipios.topojson`
}

/**
 * Prefetch the vendored municipality mesh (TopoJSON). Safe to call early so
 * City-tab choropleths do not wait on the first paint path.
 */
export function prefetchBrazilMunicipalityMesh(): void {
  void loadBrazilMunicipalityMesh()
}

async function loadBrazilMunicipalityMesh(): Promise<MunFc | null> {
  if (munNational) return munNational
  if (munNationalInflight) return munNationalInflight

  munNationalInflight = (async () => {
    try {
      const res = await fetch(brazilMunicipiosUrl(), {
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const topo = (await res.json()) as Topology<{
        municipalities: GeometryCollection<{ id: string }>
      }>
      const obj =
        topo.objects.municipalities ??
        topo.objects[Object.keys(topo.objects)[0] as 'municipalities']
      if (!obj) throw new Error('empty topojson objects')
      const fc = feature(topo, obj) as MunFc
      // Do NOT rewind here — the vendored TopoJSON is already wound for
      // d3-geo. A second rewind inverts rings (area ≈ 4π) and canvas fills
      // paint the whole map stage, including ocean outside Brazil.
      for (const f of fc.features) {
        const id = String(f.properties?.id ?? f.id ?? '')
        f.properties = { id }
        f.id = id
      }
      munNational = fc
      return fc
    } catch {
      return null
    } finally {
      munNationalInflight = null
    }
  })()

  return munNationalInflight
}

export function normalizePlaceName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Bundled IBGE UF mesh (vendored); sync also keeps a public copy for Pages. */
export function brazilUfCollection(): FeatureCollection<
  Geometry,
  { uf: string; ibge: string }
> {
  // Already rewound in the vendored file; keep a defensive pass for safety.
  return brazilUfs as FeatureCollection<Geometry, { uf: string; ibge: string }>
}

export async function fetchBrazilUfCollection(): Promise<FeatureCollection<
  Geometry,
  { uf: string; ibge: string }
> | null> {
  return brazilUfCollection()
}

/**
 * Municipality polygons for a UF, keyed by TSE city codes (`SP-71072`).
 * Served from the vendored national mesh (no live IBGE).
 */
export async function fetchUfMunicipalityCollection(
  uf: string,
  _cities?: CityResult[],
): Promise<MunFc | null> {
  const cached = munByUf.get(uf)
  if (cached) return cached
  const national = await loadBrazilMunicipalityMesh()
  if (!national) return null
  const prefix = `${uf}-`
  const features = national.features.filter((f) =>
    String(f.properties.id).startsWith(prefix),
  )
  if (!features.length) return null
  const fc: MunFc = { type: 'FeatureCollection', features }
  munByUf.set(uf, fc)
  return fc
}

export async function fetchCityFeature(
  uf: string,
  cityCode: string,
  cities?: CityResult[],
): Promise<Feature<Geometry, { id: string }> | null> {
  const fc = await fetchUfMunicipalityCollection(uf, cities)
  if (!fc) return null
  return fc.features.find((f) => f.properties.id === cityCode) ?? null
}

/**
 * All municipality polygons for Brazil from the vendored TopoJSON mesh.
 * Used for the national City-tab choropleth — no live IBGE dependency.
 */
export async function fetchBrazilMunicipalityCollection(
  _cities?: CityResult[],
): Promise<MunFc | null> {
  return loadBrazilMunicipalityMesh()
}

export function suburbsForCity(
  suburbs: CityResult[] | null | undefined,
  cityCode: string,
): CityResult[] {
  if (!suburbs?.length) return []
  const prefix = `${cityCode}-`
  return suburbs.filter((s) => s.code.startsWith(prefix))
}

/**
 * Municipalities with a within-city neighborhood (zona) breakdown.
 * Prefer `zoneCount` from brazil-cities.json; fall back to counting suburbs.
 */
export function citiesWithNeighborhoods(
  cities: CityResult[] | null | undefined,
  suburbs?: CityResult[] | null,
): CityResult[] {
  if (!cities?.length) return []
  if (cities.some((c) => c.zoneCount != null)) {
    return cities.filter((c) => (c.zoneCount ?? 0) >= 2)
  }
  if (!suburbs?.length) return []
  const counts = new Map<string, number>()
  for (const s of suburbs) {
    const code = s.code.replace(/-Z\d{3}$/, '')
    counts.set(code, (counts.get(code) || 0) + 1)
  }
  return cities.filter((c) => (counts.get(c.code) || 0) >= 2)
}

/** Parse `UF-#####` city code → UF. */
export function ufFromCityCode(cityCode: string): string | null {
  const m = /^([A-Z]{2})-/.exec(cityCode)
  return m?.[1] ?? null
}

export function parentFocus(focus: MapFocus): MapFocus {
  switch (focus.level) {
    case 'city':
      return { level: 'uf', uf: focus.uf }
    case 'uf':
      return { level: 'brazil' }
    case 'brazil':
      return { level: 'world' }
    default:
      return { level: 'world' }
  }
}

export function tableViewForFocus(
  focus: MapFocus,
): 'countries' | 'areas' | 'cities' | 'suburbs' {
  switch (focus.level) {
    case 'brazil':
      return 'areas'
    case 'uf':
      return 'cities'
    case 'city':
      return 'suburbs'
    default:
      return 'countries'
  }
}
