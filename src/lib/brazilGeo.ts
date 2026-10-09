import type { Feature, FeatureCollection, Geometry, Position } from 'geojson'
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

const munCache = new Map<string, FeatureCollection<Geometry, { id: string }>>()
const munInflight = new Map<
  string,
  Promise<FeatureCollection<Geometry, { id: string }> | null>
>()
const nameCache = new Map<string, Map<string, string>>()
const nameInflight = new Map<string, Promise<Map<string, string> | null>>()

export function normalizePlaceName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Common IBGE ↔ TSE spelling mismatches. */
const NAME_ALIASES: Record<string, string> = {
  'sao luis do paraitinga': 'sao luiz do paraitinga',
  'muquem de sao francisco': 'muquem do sao francisco',
  "olho d agua do casado": 'olho dagua do casado',
  'poxoreo': 'poxoreu',
  'atilio vivacqua': 'atilio vivacqua',
}

function aliasKey(norm: string): string {
  return NAME_ALIASES[norm] ?? norm
}

function ibgeMunUrl(ufIbge: string): string {
  return `https://servicodados.ibge.gov.br/api/v3/malhas/estados/${ufIbge}?formato=application/vnd.geo%2Bjson&qualidade=minima&intrarregiao=municipio`
}

function ibgeNamesUrl(ufIbge: string): string {
  return `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${ufIbge}/municipios`
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

async function fetchIbgeNameMap(uf: string): Promise<Map<string, string> | null> {
  const cached = nameCache.get(uf)
  if (cached) return cached
  const inflight = nameInflight.get(uf)
  if (inflight) return inflight
  const ufIbge = UF_TO_IBGE[uf]
  if (!ufIbge) return null
  const p = (async () => {
    try {
      const res = await fetch(ibgeNamesUrl(ufIbge), {
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const rows = (await res.json()) as { id: number; nome: string }[]
      const map = new Map<string, string>()
      for (const row of rows) {
        map.set(aliasKey(normalizePlaceName(row.nome)), String(row.id))
      }
      nameCache.set(uf, map)
      return map
    } catch {
      return null
    } finally {
      nameInflight.delete(uf)
    }
  })()
  nameInflight.set(uf, p)
  return p
}

/**
 * Load municipality polygons for a UF, keyed by our city codes (`SP-71072`).
 * Joins IBGE malha (`codarea`) to TSE rows via municipality name.
 */
export async function fetchUfMunicipalityCollection(
  uf: string,
  cities: CityResult[],
): Promise<FeatureCollection<Geometry, { id: string }> | null> {
  const cached = munCache.get(uf)
  if (cached) return cached
  const inflight = munInflight.get(uf)
  if (inflight) return inflight

  const ufIbge = UF_TO_IBGE[uf]
  if (!ufIbge) return null

  const p = (async () => {
    try {
      const [meshRes, nameMap] = await Promise.all([
        fetch(ibgeMunUrl(ufIbge), { headers: { Accept: 'application/json' } }),
        fetchIbgeNameMap(uf),
      ])
      if (!meshRes.ok || !nameMap) throw new Error('mesh fetch failed')
      const mesh = (await meshRes.json()) as FeatureCollection<
        Geometry,
        { codarea?: string }
      >

      const ibgeToCity = new Map<string, string>()
      for (const city of cities) {
        if (city.area !== uf) continue
        const key = aliasKey(normalizePlaceName(city.namePt || city.name))
        const ibge = nameMap.get(key)
        if (ibge) ibgeToCity.set(ibge, city.code)
      }

      const features: Feature<Geometry, { id: string }>[] = []
      for (const f of mesh.features) {
        const ibge = String(f.properties?.codarea ?? '')
        const cityCode = ibgeToCity.get(ibge)
        if (!cityCode || !f.geometry) continue
        features.push({
          type: 'Feature',
          id: cityCode,
          properties: { id: cityCode },
          geometry: rewindGeometry(f.geometry),
        })
      }

      const fc: FeatureCollection<Geometry, { id: string }> = {
        type: 'FeatureCollection',
        features,
      }
      munCache.set(uf, fc)
      return fc
    } catch {
      return null
    } finally {
      munInflight.delete(uf)
    }
  })()
  munInflight.set(uf, p)
  return p
}

export async function fetchCityFeature(
  uf: string,
  cityCode: string,
  cities: CityResult[],
): Promise<Feature<Geometry, { id: string }> | null> {
  const fc = await fetchUfMunicipalityCollection(uf, cities)
  if (!fc) return null
  return fc.features.find((f) => f.properties.id === cityCode) ?? null
}

/**
 * All municipality polygons for Brazil (union of per-UF IBGE meshes).
 * Used for the national City-tab choropleth.
 */
export async function fetchBrazilMunicipalityCollection(
  cities: CityResult[],
): Promise<FeatureCollection<Geometry, { id: string }> | null> {
  if (!cities.length) return null
  const ufs = [
    ...new Set(
      cities
        .map((c) => c.area)
        .filter((uf): uf is string => !!uf && !!UF_TO_IBGE[uf]),
    ),
  ].sort()
  const parts = await Promise.all(
    ufs.map((uf) => fetchUfMunicipalityCollection(uf, cities)),
  )
  const features = parts.flatMap((fc) => fc?.features ?? [])
  if (!features.length) return null
  return { type: 'FeatureCollection', features }
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
