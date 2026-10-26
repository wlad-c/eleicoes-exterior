#!/usr/bin/env node
/**
 * Build a vendored Brazil municipality mesh keyed by TSE city codes (UF-#####).
 *
 * Sources:
 * - Per-UF GeoJSON from geodata-br (IBGE-derived municipalities)
 * - Official IBGE names (kelvins/Municipios-Brasileiros) for join aliases
 * - OSM Nominatim polygons for a handful of municipalities missing from geodata-br
 *
 * Output: src/data/brazil-municipios.topojson (rewound for d3-geo, quantized).
 *
 * Requires: network, `npx mapshaper`.
 */
import { spawnSync } from 'node:child_process'
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const cacheDir = join(__dirname, 'data', 'municipios-cache')
const outTopo = join(root, 'src', 'data', 'brazil-municipios.topojson')

const IBGE_TO_UF = {
  11: 'RO',
  12: 'AC',
  13: 'AM',
  14: 'RR',
  15: 'PA',
  16: 'AP',
  17: 'TO',
  21: 'MA',
  22: 'PI',
  23: 'CE',
  24: 'RN',
  25: 'PB',
  26: 'PE',
  27: 'AL',
  28: 'SE',
  29: 'BA',
  31: 'MG',
  32: 'ES',
  33: 'RJ',
  35: 'SP',
  41: 'PR',
  42: 'SC',
  43: 'RS',
  50: 'MS',
  51: 'MT',
  52: 'GO',
  53: 'DF',
}

/** Geo/IBGE spelling → TSE spelling (normalized keys). */
const NAME_ALIASES = {
  'sao luis do paraitinga': 'sao luiz do paraitinga',
  'muquem de sao francisco': 'muquem do sao francisco',
  "olho d agua do casado": 'olho dagua do casado',
  poxoreo: 'poxoreu',
  'atilio vivacqua': 'atilio vivacqua',
  'espigao d oeste': 'espigao do oeste',
  'alvorada d oeste': 'alvorada do oeste',
  'santa isabel do para': 'santa izabel do para',
  'fortaleza do tabocao': 'tabocao',
  'sao valerio da natividade': 'sao valerio',
  itapage: 'itapaje',
  acu: 'assu',
  ares: 'arez',
  'augusto severo': 'campo grande',
  'januario cicco': 'boa saude',
  'presidente juscelino': 'serra caiada',
  santarem: 'joca claudino',
  serido: 'sao vicente do serido',
  'campo de santana': 'tacima',
  'belem de sao francisco': 'belem do sao francisco',
  iguaraci: 'iguaracy',
  'lagoa do itaenga': 'lagoa de itaenga',
  'gracho cardoso': 'graccho cardoso',
  'santa teresinha': 'santa terezinha',
  brasopolis: 'brazopolis',
  embu: 'embu das artes',
  'bom jesus de goias': 'bom jesus',
  florinia: 'florinea',
  'munhoz de melo': 'munhoz de mello',
}

/** Municipalities absent from geodata-br; filled from OSM Nominatim. */
const OSM_SUPPLEMENTS = [
  {
    code: 'MS-55050',
    name: 'Paraíso das Águas',
    state: 'Mato Grosso do Sul',
    ibge: '5006275',
  },
  {
    code: 'MT-73709',
    name: 'Boa Esperança do Norte',
    state: 'Mato Grosso',
    ibge: '5101837',
  },
  {
    code: 'PA-04863',
    name: 'Mojuí dos Campos',
    state: 'Pará',
    ibge: '1504752',
  },
  { code: 'PI-12726', name: 'Nazária', state: 'Piauí', ibge: '2206720' },
  {
    code: 'RS-89540',
    name: 'Pinto Bandeira',
    state: 'Rio Grande do Sul',
    ibge: '4314548',
  },
  {
    code: 'SC-83909',
    name: 'Balneário Rincão',
    state: 'Santa Catarina',
    ibge: '4220000',
  },
  {
    code: 'SC-83925',
    name: 'Pescaria Brava',
    state: 'Santa Catarina',
    ibge: '4212650',
  },
]

function baseNorm(name) {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function aliasKey(norm) {
  return NAME_ALIASES[norm] ?? norm
}

function rewindRing(ring) {
  return ring.slice().reverse()
}

function rewindGeometry(geometry) {
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

function shoelace(ring) {
  let a = 0
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
  }
  return a / 2
}

/**
 * geodata-br occasionally puts tiny island rings before the mainland exterior.
 * GeoJSON requires the exterior first; TopoJSON drops those polygons otherwise.
 */
function normalizePolygonRings(coords) {
  const rings = coords.filter((r) => Array.isArray(r) && r.length >= 4)
  if (!rings.length) return null
  rings.sort((a, b) => Math.abs(shoelace(b)) - Math.abs(shoelace(a)))
  const exterior = rings[0]
  const extSign = shoelace(exterior) >= 0 ? 1 : -1
  const holes = []
  const islands = []
  for (const r of rings.slice(1)) {
    const sign = shoelace(r) >= 0 ? 1 : -1
    if (sign === extSign) islands.push(r)
    else holes.push(r)
  }
  if (!islands.length) {
    return { type: 'Polygon', coordinates: [exterior, ...holes] }
  }
  return {
    type: 'MultiPolygon',
    coordinates: [[exterior, ...holes], ...islands.map((isl) => [isl])],
  }
}

function normalizeGeometry(geometry) {
  if (!geometry) return null
  if (geometry.type === 'Polygon') {
    return normalizePolygonRings(geometry.coordinates)
  }
  if (geometry.type === 'MultiPolygon') {
    const polys = []
    for (const poly of geometry.coordinates) {
      const n = normalizePolygonRings(poly)
      if (!n) continue
      if (n.type === 'Polygon') polys.push(n.coordinates)
      else polys.push(...n.coordinates)
    }
    if (!polys.length) return null
    return polys.length === 1
      ? { type: 'Polygon', coordinates: polys[0] }
      : { type: 'MultiPolygon', coordinates: polys }
  }
  return geometry
}

async function download(url, dest, { encoding } = {}) {
  mkdirSync(dirname(dest), { recursive: true })
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'eleicoes-exterior-map-build/1.0 (github.com/wlad-c/eleicoes-exterior)',
      Accept: '*/*',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  if (encoding) {
    const buf = Buffer.from(await res.arrayBuffer())
    writeFileSync(dest, buf)
    return
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
}

function readJson(path, encoding = 'utf8') {
  return JSON.parse(readFileSync(path, encoding))
}

function indexTseCities() {
  const byCode = new Map()
  for (const file of ['brazil-cities.json', 'brazil-cities-runoff.json']) {
    const payload = readJson(join(root, 'src', 'data', file))
    for (const c of payload.cities) byCode.set(c.code, c)
  }
  const byUf = new Map()
  for (const c of byCode.values()) {
    const uf = c.area
    if (!uf) continue
    if (!byUf.has(uf)) byUf.set(uf, new Map())
    const m = byUf.get(uf)
    const raw = baseNorm(c.namePt || c.name || '')
    m.set(raw, c.code)
    m.set(aliasKey(raw), c.code)
  }
  return { byCode, byUf }
}

function lookupCode(byUf, uf, names) {
  const m = byUf.get(uf)
  if (!m) return null
  for (const n of names) {
    if (!n) continue
    const bn = baseNorm(n)
    const variants = [
      bn,
      aliasKey(bn),
      bn.replace(/ d /g, ' do '),
      bn.replace(/ d /g, ' de '),
      bn.replace(/ do /g, ' de '),
      bn.replace(/ de /g, ' do '),
    ]
    for (const key of variants) {
      const code = m.get(key) || m.get(aliasKey(key))
      if (code) return code
    }
  }
  return null
}

async function ensureGeodataBr() {
  const jobs = Object.keys(IBGE_TO_UF).map(async (ibge) => {
    const dest = join(cacheDir, `geojs-${ibge}-mun.json`)
    try {
      readFileSync(dest)
      return dest
    } catch {
      /* download */
    }
    const url = `https://raw.githubusercontent.com/tbrugz/geodata-br/master/geojson/geojs-${ibge}-mun.json`
    console.log('fetch', url)
    await download(url, dest)
    return dest
  })
  return Promise.all(jobs)
}

async function ensureIbgeNames() {
  const dest = join(cacheDir, 'ibge-municipios.json')
  try {
    return readJson(dest, 'utf8')
  } catch {
    /* download */
  }
  const url =
    'https://raw.githubusercontent.com/kelvins/Municipios-Brasileiros/main/json/municipios.json'
  console.log('fetch', url)
  await download(url, dest)
  // File may carry a UTF-8 BOM.
  return JSON.parse(readFileSync(dest, 'utf8-sig'))
}

async function ensureOsmSupplements() {
  const out = []
  for (const row of OSM_SUPPLEMENTS) {
    const dest = join(cacheDir, `osm-${row.code}.json`)
    let fc
    try {
      fc = readJson(dest)
    } catch {
      const q = new URLSearchParams({
        city: row.name,
        state: row.state,
        country: 'Brazil',
        format: 'geojson',
        polygon_geojson: '1',
        limit: '1',
      })
      const url = `https://nominatim.openstreetmap.org/search?${q}`
      console.log('fetch', row.code, url)
      await download(url, dest)
      // Nominatim rate limit.
      await new Promise((r) => setTimeout(r, 1200))
      fc = readJson(dest)
    }
    const feat = fc.features?.[0]
    if (!feat?.geometry) {
      throw new Error(`OSM miss for ${row.code}`)
    }
    out.push({
      type: 'Feature',
      id: row.code,
      properties: { id: row.code, ibge: row.ibge, uf: row.code.slice(0, 2) },
      geometry: feat.geometry,
    })
  }
  return out
}

function runMapshaper(args) {
  const r = spawnSync('npx', ['--yes', 'mapshaper', ...args], {
    cwd: root,
    stdio: 'inherit',
    shell: false,
  })
  if (r.status !== 0) {
    throw new Error(`mapshaper failed (${r.status})`)
  }
}

async function main() {
  mkdirSync(cacheDir, { recursive: true })
  const { byCode, byUf } = indexTseCities()
  console.log('TSE cities', byCode.size)

  const [paths, ibgeRows, osmFeats] = await Promise.all([
    ensureGeodataBr(),
    ensureIbgeNames(),
    ensureOsmSupplements(),
  ])
  const ibgeName = new Map(
    ibgeRows.map((r) => [String(r.codigo_ibge), r.nome]),
  )

  const byId = new Map()
  for (const path of paths) {
    const ibgeUf = path.match(/geojs-(\d+)-mun\.json$/)?.[1]
    const uf = IBGE_TO_UF[ibgeUf]
    if (!uf) continue
    const fc = readJson(path)
    for (const f of fc.features) {
      const props = f.properties || {}
      const ibge = String(props.id || '')
      const code = lookupCode(byUf, uf, [
        props.name,
        props.description,
        ibgeName.get(ibge),
      ])
      if (!code || !f.geometry) continue
      byId.set(code, {
        type: 'Feature',
        id: code,
        properties: { id: code, ibge, uf },
        geometry: f.geometry,
      })
    }
  }
  for (const f of osmFeats) byId.set(f.properties.id, f)

  const missing = [...byCode.keys()].filter((c) => !byId.has(c))
  if (missing.length || byId.size !== byCode.size) {
    console.error('join incomplete', {
      features: byId.size,
      tse: byCode.size,
      missing: missing.slice(0, 40),
    })
    process.exit(1)
  }

  const features = []
  for (const f of [...byId.values()].sort((a, b) =>
    a.properties.id.localeCompare(b.properties.id),
  )) {
    const geometry = normalizeGeometry(f.geometry)
    if (!geometry) {
      console.error('degenerate geometry', f.properties.id)
      process.exit(1)
    }
    features.push({
      type: 'Feature',
      id: f.properties.id,
      properties: { id: f.properties.id },
      geometry: rewindGeometry(geometry),
    })
  }

  const rawPath = join(cacheDir, 'brazil-municipios-joined.json')
  writeFileSync(
    rawPath,
    JSON.stringify({ type: 'FeatureCollection', features }),
  )
  console.log('joined', features.length, '→ simplify')

  const simpPath = join(cacheDir, 'brazil-municipios-simplified.json')
  runMapshaper([
    rawPath,
    '-simplify',
    'weighted',
    '4%',
    'keep-shapes',
    '-o',
    'format=geojson',
    'precision=0.0001',
    simpPath,
  ])

  // Normalize + rewind after mapshaper (simplify can flip / reorder rings).
  const simp = readJson(simpPath)
  const cleaned = []
  for (const f of simp.features) {
    const id = f.properties?.id || f.id
    const geometry = normalizeGeometry(f.geometry)
    if (!geometry) {
      console.error('degenerate after simplify', id)
      process.exit(1)
    }
    cleaned.push({
      type: 'Feature',
      id,
      properties: { id },
      geometry: rewindGeometry(geometry),
    })
  }
  if (cleaned.length !== byCode.size) {
    console.error('feature count mismatch after simplify', cleaned.length)
    process.exit(1)
  }
  writeFileSync(
    simpPath,
    JSON.stringify({ type: 'FeatureCollection', features: cleaned }),
  )

  mkdirSync(dirname(outTopo), { recursive: true })
  const topoTmp = join(cacheDir, 'brazil-municipios.topojson')
  runMapshaper([
    simpPath,
    '-o',
    'format=topojson',
    'quantization=1e5',
    topoTmp,
  ])
  // Stable object name for the client loader.
  const topo = JSON.parse(readFileSync(topoTmp, 'utf8'))
  const oldName = Object.keys(topo.objects)[0]
  topo.objects = { municipalities: topo.objects[oldName] }
  writeFileSync(outTopo, JSON.stringify(topo))
  console.log('wrote', outTopo)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
