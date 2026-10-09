#!/usr/bin/env node
/**
 * Attach lat/lon centroids to brazil-suburbs.json (and city centroids to
 * brazil-cities.json) from TSE eleitorado_local_votacao NR_LATITUDE /
 * NR_LONGITUDE — so the city map can place neighborhoods geographically
 * instead of a fake marker grid.
 *
 * Usage: node scripts/enrich-suburb-coords.mjs
 * Looks for CSVs under $ELEITORADO_DIR or /tmp/eleicoes-brazil-locals,
 * falling back to unzipping the CDN zip into /tmp/eleitorado-locais.
 */
import {
  createReadStream,
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  statSync,
} from 'node:fs'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'

const ROOT = new URL('..', import.meta.url).pathname
const SUBURBS_PATH = join(ROOT, 'src/data/brazil-suburbs.json')
const CITIES_PATH = join(ROOT, 'src/data/brazil-cities.json')
const CDN =
  'https://cdn.tse.jus.br/estatistica/sead/odsele/eleitorado_locais_votacao/eleitorado_local_votacao_2026.zip'

const UF_LIST = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO',
]

function parseCsvLine(line) {
  const out = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQ = !inQ
      continue
    }
    if (ch === ';' && !inQ) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out
}

function parseCoord(raw) {
  if (raw == null || raw === '') return null
  const n = Number.parseFloat(String(raw).replace(',', '.'))
  if (!Number.isFinite(n) || n === 0) return null
  return n
}

function findCsvDir() {
  const env = process.env.ELEITORADO_DIR
  if (env && existsSync(join(env, 'eleitorado_local_votacao_2026_SP.csv'))) {
    return env
  }
  const a = '/tmp/eleicoes-brazil-locals'
  if (existsSync(join(a, 'eleitorado_local_votacao_2026_SP.csv'))) return a
  const b = join(tmpdir(), 'eleitorado-locais')
  if (existsSync(join(b, 'eleitorado_local_votacao_2026_SP.csv'))) return b
  return null
}

async function ensureCsvDir() {
  let dir = findCsvDir()
  if (dir) return dir
  dir = join(tmpdir(), 'eleitorado-locais')
  mkdirSync(dir, { recursive: true })
  const zipPath = join(dir, 'eleitorado_local_votacao_2026.zip')
  if (!existsSync(zipPath) || statSync(zipPath).size < 1_000_000) {
    console.log('Downloading eleitorado_local_votacao_2026.zip…')
    execFileSync('curl', ['-L', '-o', zipPath, CDN], { stdio: 'inherit' })
  }
  return dir
}

/**
 * @returns {Promise<Map<string, { latSum: number, lonSum: number, w: number }>>}
 * key = `${UF}|${munCode}|${zona}`
 */
async function loadZoneCentroids(dir) {
  /** @type {Map<string, { latSum: number, lonSum: number, w: number }>} */
  const acc = new Map()
  let used = 0
  let skipped = 0

  for (const uf of UF_LIST) {
    const entry = `eleitorado_local_votacao_2026_${uf}.csv`
    let csvPath = join(dir, entry)
    if (!existsSync(csvPath) || statSync(csvPath).size < 10_000) {
      const zipPath = join(dir, 'eleitorado_local_votacao_2026.zip')
      const altZip = '/tmp/eleitorado-locais/eleitorado_local_votacao_2026.zip'
      const zip = existsSync(zipPath) ? zipPath : altZip
      if (!existsSync(zip)) {
        console.warn(`  skip ${uf}: no csv/zip`)
        continue
      }
      execFileSync('unzip', ['-o', '-j', zip, entry, '-d', dir], { stdio: 'pipe' })
      csvPath = join(dir, entry)
    }
    process.stdout.write(`  coords ${uf}…`)
    const rl = createInterface({
      input: createReadStream(csvPath, { encoding: 'latin1' }),
      crlfDelay: Infinity,
    })
    let header = null
    const idx = {}
    let ufUsed = 0
    for await (const line of rl) {
      if (!header) {
        header = parseCsvLine(line).map((h) => h.replace(/^\uFEFF/, '').replace(/^"|"$/g, ''))
        for (const name of [
          'SG_UF',
          'CD_MUNICIPIO',
          'NR_ZONA',
          'NR_TURNO',
          'NR_LATITUDE',
          'NR_LONGITUDE',
          'QT_ELEITOR_SECAO',
        ]) {
          idx[name] = header.indexOf(name)
        }
        if (idx.NR_LATITUDE < 0 || idx.NR_LONGITUDE < 0) {
          throw new Error(`${entry} missing lat/lon columns`)
        }
        continue
      }
      const cols = parseCsvLine(line).map((c) => c.replace(/^"|"$/g, ''))
      if (cols[idx.NR_TURNO] !== '1') continue
      const lat = parseCoord(cols[idx.NR_LATITUDE])
      const lon = parseCoord(cols[idx.NR_LONGITUDE])
      if (lat == null || lon == null) {
        skipped += 1
        continue
      }
      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        skipped += 1
        continue
      }
      // Brazil roughly south of equator / west of Greenwich
      if (lat > 10 || lon > -20) {
        skipped += 1
        continue
      }
      const rowUf = (cols[idx.SG_UF] || uf).replace(/^"|"$/g, '')
      const munCode = String(cols[idx.CD_MUNICIPIO] || '').padStart(5, '0')
      const zona = String(cols[idx.NR_ZONA] || '').padStart(3, '0')
      const w = Number.parseInt(cols[idx.QT_ELEITOR_SECAO], 10) || 1
      const key = `${rowUf}|${munCode}|${zona}`
      let bag = acc.get(key)
      if (!bag) {
        bag = { latSum: 0, lonSum: 0, w: 0 }
        acc.set(key, bag)
      }
      bag.latSum += lat * w
      bag.lonSum += lon * w
      bag.w += w
      used += 1
      ufUsed += 1
    }
    console.log(` ${ufUsed} locals`)
  }
  console.log(`Centroids from ${used} locals (${skipped} skipped) → ${acc.size} zones`)
  return acc
}

function round6(n) {
  return Math.round(n * 1e6) / 1e6
}

async function main() {
  const dir = await ensureCsvDir()
  console.log(`Using CSV dir: ${dir}`)
  const centroids = await loadZoneCentroids(dir)

  const suburbsDoc = JSON.parse(readFileSync(SUBURBS_PATH, 'utf8'))
  const suburbs = suburbsDoc.suburbs
  let withCoords = 0
  for (const s of suburbs) {
    // code: SP-71072-Z001
    const m = /^([A-Z]{2})-(\d{5})-Z(\d{3})$/.exec(s.code)
    if (!m) continue
    const key = `${m[1]}|${m[2]}|${m[3]}`
    const bag = centroids.get(key)
    if (!bag || !bag.w) {
      delete s.lat
      delete s.lon
      continue
    }
    s.lat = round6(bag.latSum / bag.w)
    s.lon = round6(bag.lonSum / bag.w)
    withCoords += 1
  }
  suburbsDoc.coordsFrom = 'eleitorado_local_votacao_2026 NR_LATITUDE/NR_LONGITUDE'
  suburbsDoc.withCoords = withCoords
  suburbsDoc.updatedAt = new Date().toISOString()
  writeFileSync(SUBURBS_PATH, JSON.stringify(suburbsDoc) + '\n')
  console.log(`Wrote lat/lon on ${withCoords}/${suburbs.length} suburbs → ${SUBURBS_PATH}`)

  // City centroids = average of zone centroids (unweighted by zone count for simplicity)
  const citiesDoc = JSON.parse(readFileSync(CITIES_PATH, 'utf8'))
  /** @type {Map<string, { latSum: number, lonSum: number, n: number, zones: number }>} */
  const cityAcc = new Map()
  for (const s of suburbs) {
    if (s.lat == null || s.lon == null) continue
    const cityCode = s.code.replace(/-Z\d{3}$/, '')
    let bag = cityAcc.get(cityCode)
    if (!bag) {
      bag = { latSum: 0, lonSum: 0, n: 0, zones: 0 }
      cityAcc.set(cityCode, bag)
    }
    bag.latSum += s.lat
    bag.lonSum += s.lon
    bag.n += 1
  }
  // zone counts (including zones without coords)
  const zoneCount = new Map()
  for (const s of suburbs) {
    const cityCode = s.code.replace(/-Z\d{3}$/, '')
    zoneCount.set(cityCode, (zoneCount.get(cityCode) || 0) + 1)
  }
  let citiesWith = 0
  let multiZone = 0
  for (const c of citiesDoc.cities) {
    const bag = cityAcc.get(c.code)
    const zc = zoneCount.get(c.code) || 1
    c.zoneCount = zc
    if (zc >= 2) multiZone += 1
    if (bag && bag.n) {
      c.lat = round6(bag.latSum / bag.n)
      c.lon = round6(bag.lonSum / bag.n)
      citiesWith += 1
    } else {
      delete c.lat
      delete c.lon
    }
  }
  citiesDoc.coordsFrom = suburbsDoc.coordsFrom
  citiesDoc.withCoords = citiesWith
  citiesDoc.multiZone = multiZone
  citiesDoc.updatedAt = new Date().toISOString()
  writeFileSync(CITIES_PATH, JSON.stringify(citiesDoc) + '\n')
  console.log(
    `Wrote lat/lon on ${citiesWith}/${citiesDoc.cities.length} cities (${multiZone} multi-zone) → ${CITIES_PATH}`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
