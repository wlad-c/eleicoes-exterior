#!/usr/bin/env node
/**
 * Attach registered / no-valid-vote fields to YearResult payloads:
 *   - 2022 ZZ areas + countries from detalhe_votacao_munzona
 *     (QT_APTOS / QT_ABSTENCOES / QT_VOTOS_BRANCOS / QT_TOTAL_VOTOS_NULOS)
 *   - 2026 ZZ areas + countries from TSE EA20 `e.te` / `e.a` / `v.vb` / `v.tvn`
 *   - Brazil national + UF areas (2022 munzona + 2026 EA20)
 *   - Brazil municipalities (brazil-cities.json) + zonas (brazil-suburbs.json)
 *     from detalhe_votacao_munzona 2022 + 2026 (zone grain; cities = sum of zones)
 *
 * noValidVote = abstentions + blank + null (= aptos − válidos).
 * Does not rebuild vote totals — only electorate overlays.
 *
 * Usage: node scripts/apply-abstention.mjs
 */
import { createWriteStream, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { createInterface } from 'node:readline'
import { createReadStream } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const RESULTS_PATH = join(ROOT, 'src/data/results.json')
const CITY_2022_PATH = join(ROOT, 'src/data/tse-city-2022.json')
const CITY_MAP_PATH = join(ROOT, 'src/data/tse-city-map.json')
const BRAZIL_CITIES_PATH = join(ROOT, 'src/data/brazil-cities.json')
const BRAZIL_SUBURBS_PATH = join(ROOT, 'src/data/brazil-suburbs.json')

const HOST = 'https://resultados.tse.jus.br'
const AMBIENTE = 'oficial'
const CICLO = 'ele2026'
const ELEICAO = '6257'
const CARGO = '1'
const UA = 'eleicoes-exterior/1.0 (+no-valid-vote overlay)'
const CDN = 'https://cdn.tse.jus.br'
const MUNZONA_ZIP = (year) =>
  `${CDN}/estatistica/sead/odsele/detalhe_votacao_munzona/detalhe_votacao_munzona_${year}.zip`

const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA',
  'PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]

function pad(n, w) {
  return String(n).padStart(w, '0')
}

function round1(n) {
  return Math.round(n * 100) / 100
}

function parseIntPT(v) {
  if (v == null) return 0
  return Number.parseInt(String(v).replace(/\./g, ''), 10) || 0
}

function emptyEl() {
  return { registered: 0, abstentions: 0, blank: 0, nullVotes: 0 }
}

function addEl(agg, el) {
  agg.registered += el.registered
  agg.abstentions += el.abstentions
  agg.blank += el.blank
  agg.nullVotes += el.nullVotes
}

/**
 * Attach electorate extras. noValidVote = abs + blank + null
 * (fallback: registered − totalValid).
 */
function withElectorate(y, registered, abstentions, blank, nullVotes) {
  if (!y || registered == null || registered <= 0) return y
  const out = { ...y, registered }
  delete out.abstentionPct
  if (abstentions != null) out.abstentions = abstentions
  if (blank != null) out.blank = blank
  if (nullVotes != null) out.nullVotes = nullVotes

  let noValid
  if (abstentions != null && blank != null && nullVotes != null) {
    noValid = abstentions + blank + nullVotes
  } else {
    noValid = Math.max(0, registered - (y.totalValid || 0))
  }
  out.noValidVote = noValid
  out.noValidVotePct = round1((noValid / registered) * 100)
  return out
}

function applyEl(y, el) {
  if (!el) return y
  return withElectorate(
    y,
    el.registered,
    el.abstentions,
    el.blank,
    el.nullVotes,
  )
}

function parseCsvLine(line) {
  const cols = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQ = !inQ
      continue
    }
    if (ch === ';' && !inQ) {
      cols.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  cols.push(cur)
  return cols.map((c) => c.replace(/^"|"$/g, ''))
}

async function download(url, dest) {
  if (existsSync(dest) && (await import('node:fs')).statSync(dest).size > 1000) {
    console.log('Using cached', dest)
    return dest
  }
  console.log('Downloading', url)
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
  return dest
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return res.json()
}

function ea20Url(abr, municipioCode = '') {
  const folder = abr.toLowerCase()
  const mun = municipioCode ? pad(municipioCode, 5) : ''
  const file = `${folder}${mun}-c${pad(CARGO, 4)}-e${pad(ELEICAO, 6)}-u.json`
  return `${HOST}/${AMBIENTE}/${CICLO}/${ELEICAO}/dados/${folder}/${file}`
}

function electorateOf(doc) {
  const registered = parseIntPT(doc?.e?.te)
  if (registered <= 0) return null
  return {
    registered,
    abstentions: parseIntPT(doc?.e?.a),
    blank: parseIntPT(doc?.v?.vb),
    nullVotes: parseIntPT(doc?.v?.tvn),
  }
}

/**
 * President 1st-round electorate from detalhe_votacao_munzona BRASIL CSV.
 * Returns:
 *   zz: Map(munCode → el)           overseas ZZ municipalities
 *   ufs: Map(UF → el)               domestic UF totals
 *   cities: Map(`${UF}|${mun}` → el)
 *   zones: Map(`${UF}|${mun}|${zona}` → el)  zona padded to 3 digits
 */
async function loadMunzonaElectorate(year) {
  const work = join(tmpdir(), 'eleicoes-abstention')
  mkdirSync(work, { recursive: true })
  const zipPath = join(work, `detalhe_votacao_munzona_${year}.zip`)
  await download(MUNZONA_ZIP(year), zipPath)
  const csvName = `detalhe_votacao_munzona_${year}_BRASIL.csv`
  const csvPath = join(work, csvName)
  if (!existsSync(csvPath)) {
    execFileSync('unzip', ['-o', zipPath, csvName, '-d', work], { stdio: 'inherit' })
  }

  const zz = new Map()
  const ufs = new Map()
  const cities = new Map()
  const zones = new Map()
  const rl = createInterface({
    input: createReadStream(csvPath, { encoding: 'latin1' }),
    crlfDelay: Infinity,
  })
  let header = null
  let idx = {}
  for await (const line of rl) {
    if (!header) {
      header = parseCsvLine(line)
      header.forEach((h, i) => {
        idx[h] = i
      })
      continue
    }
    const cols = parseCsvLine(line)
    if (cols[idx.NR_TURNO] !== '1') continue
    const cargo = cols[idx.CD_CARGO]
    if (cargo !== '1' && cargo !== '01') continue
    const uf = cols[idx.SG_UF]
    const registered = Number.parseInt(cols[idx.QT_APTOS] || '0', 10) || 0
    const abstentions = Number.parseInt(cols[idx.QT_ABSTENCOES] || '0', 10) || 0
    const blank = Number.parseInt(cols[idx.QT_VOTOS_BRANCOS] || '0', 10) || 0
    const nullVotes =
      Number.parseInt(cols[idx.QT_TOTAL_VOTOS_NULOS] || '0', 10) || 0
    const mun = pad(cols[idx.CD_MUNICIPIO] || '', 5)
    const zonaRaw = String(cols[idx.NR_ZONA] || '').trim()
    const zona = zonaRaw ? pad(zonaRaw, 3) : ''
    const el = { registered, abstentions, blank, nullVotes }

    if (uf === 'ZZ') {
      if (!mun || mun === '00000') continue
      const agg = zz.get(mun) || emptyEl()
      addEl(agg, el)
      zz.set(mun, agg)
      continue
    }
    if (!UFS.includes(uf) || !mun || mun === '00000') continue

    const cityKey = `${uf}|${mun}`
    const cityAgg = cities.get(cityKey) || emptyEl()
    addEl(cityAgg, el)
    cities.set(cityKey, cityAgg)

    const ufAgg = ufs.get(uf) || emptyEl()
    addEl(ufAgg, el)
    ufs.set(uf, ufAgg)

    if (zona) {
      const zoneKey = `${uf}|${mun}|${zona}`
      const zoneAgg = zones.get(zoneKey) || emptyEl()
      addEl(zoneAgg, el)
      zones.set(zoneKey, zoneAgg)
    }
  }
  console.log(
    `${year} electorate: ${zz.size} ZZ muns, ${ufs.size} UFs, ${cities.size} cities, ${zones.size} zones`,
  )
  return { zz, ufs, cities, zones }
}

function patchYearResult(row, yearKey, el) {
  if (!el || !row?.[yearKey]) return false
  row[yearKey] = applyEl(row[yearKey], el)
  return true
}

function patchBrazilLocals(citiesDoc, suburbsDoc, el2022, el2026) {
  let cities26 = 0
  let cities22 = 0
  for (const city of citiesDoc.cities || []) {
    // code: UF-MMMMM
    const m = String(city.code || '').match(/^([A-Z]{2})-(\d{5})$/)
    if (!m) continue
    const key = `${m[1]}|${m[2]}`
    if (patchYearResult(city, 'y2026', el2026.cities.get(key))) cities26++
    if (patchYearResult(city, 'y2022', el2022.cities.get(key))) cities22++
  }

  let suburbs26 = 0
  let suburbs22 = 0
  for (const suburb of suburbsDoc.suburbs || []) {
    // code: UF-MMMMM-Znnn
    const m = String(suburb.code || '').match(/^([A-Z]{2})-(\d{5})-Z(\d{3})$/i)
    if (!m) continue
    const key = `${m[1]}|${m[2]}|${m[3]}`
    if (patchYearResult(suburb, 'y2026', el2026.zones.get(key))) suburbs26++
    if (patchYearResult(suburb, 'y2022', el2022.zones.get(key))) suburbs22++
  }

  citiesDoc.updatedAt = new Date().toISOString()
  suburbsDoc.updatedAt = new Date().toISOString()
  writeFileSync(BRAZIL_CITIES_PATH, JSON.stringify(citiesDoc) + '\n')
  writeFileSync(BRAZIL_SUBURBS_PATH, JSON.stringify(suburbsDoc) + '\n')
  console.log(
    `Patched brazil-cities.json: 2026=${cities26}/${(citiesDoc.cities || []).length}, 2022=${cities22}`,
  )
  console.log(
    `Patched brazil-suburbs.json: 2026=${suburbs26}/${(suburbsDoc.suburbs || []).length}, 2022=${suburbs22}`,
  )
}

async function mapPool(items, concurrency, worker) {
  const out = new Array(items.length)
  let i = 0
  async function run() {
    while (i < items.length) {
      const idx = i++
      out[idx] = await worker(items[idx], idx)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length || 1) }, () => run()),
  )
  return out
}

async function main() {
  const cityMap = JSON.parse(readFileSync(CITY_MAP_PATH, 'utf8'))
  const city2022 = JSON.parse(readFileSync(CITY_2022_PATH, 'utf8'))
  const results = JSON.parse(readFileSync(RESULTS_PATH, 'utf8'))

  const el2022 = await loadMunzonaElectorate(2022)
  const el2026Munzona = await loadMunzonaElectorate(2026)
  const zz2022 = el2022.zz
  const uf2022 = el2022.ufs
  let patchedCity2022 = 0
  for (const [code, el] of zz2022) {
    const row = city2022[code]
    if (!row) continue
    city2022[code] = applyEl(row, el)
    patchedCity2022++
  }
  writeFileSync(CITY_2022_PATH, JSON.stringify(city2022, null, 2) + '\n')
  console.log(`Patched tse-city-2022.json electorate on ${patchedCity2022} areas`)

  // Aggregate 2022 ZZ electorate by country.
  const country2022 = new Map()
  for (const [code, el] of zz2022) {
    const countryId = cityMap[code]
    if (!countryId) continue
    const agg = country2022.get(countryId) || emptyEl()
    addEl(agg, el)
    country2022.set(countryId, agg)
  }

  // Patch area y2022 from city2022; country y2022 from aggregate.
  let areaY2022 = 0
  let countryY2022 = 0
  for (const country of results.countries) {
    if (country.domestic) continue
    const el = country2022.get(country.id)
    if (el && country.y2022) {
      country.y2022 = applyEl(country.y2022, el)
      countryY2022++
    }
    for (const area of country.areas || []) {
      const raw = city2022[area.code]
      if (!raw || !area.y2022) continue
      area.y2022 = applyEl(area.y2022, {
        registered: raw.registered,
        abstentions: raw.abstentions,
        blank: raw.blank,
        nullVotes: raw.nullVotes,
      })
      areaY2022++
    }
  }
  console.log(`Patched results.json 2022 electorate: ${countryY2022} countries, ${areaY2022} areas`)

  // 2026 ZZ from EA20 per area (reuse map of reported areas / city map).
  console.log('Fetching 2026 ZZ EA20 electorate…')
  const codes = Object.keys(cityMap).sort()
  const munElectorate = new Map()
  const docs = await mapPool(codes, 16, async (code) => {
    try {
      const doc = await fetchJson(ea20Url('zz', code))
      return { code, el: electorateOf(doc) }
    } catch {
      return { code, el: null }
    }
  })
  for (const row of docs) {
    if (row.el) munElectorate.set(row.code, row.el)
  }
  console.log(`2026 ZZ electorate: ${munElectorate.size} municipalities`)

  let areaY2026 = 0
  let countryY2026 = 0
  for (const country of results.countries) {
    if (country.domestic) continue
    const agg = emptyEl()
    let has = false
    for (const area of country.areas || []) {
      const el = munElectorate.get(area.code)
      if (!el || !area.y2026) continue
      area.y2026 = applyEl(area.y2026, el)
      areaY2026++
      has = true
      addEl(agg, el)
    }
    // Prefer sum of areas; fall back to country-level map of known muns.
    if (!has) {
      for (const [code, el] of munElectorate) {
        if (cityMap[code] !== country.id) continue
        has = true
        addEl(agg, el)
      }
    }
    if (has && country.y2026) {
      country.y2026 = applyEl(country.y2026, agg)
      countryY2026++
    }
  }
  console.log(`Patched results.json 2026 electorate: ${countryY2026} countries, ${areaY2026} areas`)

  // Brazil domestic: UF 2022 from BRASIL munzona + UF 2026 EA20.
  console.log('Fetching 2026 Brazil UF EA20 electorate…')
  const ufDocs = await mapPool(UFS, 8, async (uf) => {
    try {
      const doc = await fetchJson(ea20Url(uf))
      return { uf, el: electorateOf(doc) }
    } catch (e) {
      console.warn(`  skip UF ${uf}: ${e.message}`)
      return { uf, el: null }
    }
  })
  const uf2026 = new Map(ufDocs.filter((r) => r.el).map((r) => [r.uf, r.el]))

  const brazil = results.countries.find((c) => c.domestic)
  if (brazil) {
    const agg22 = emptyEl()
    const agg26 = emptyEl()
    let has22 = false
    let has26 = false
    for (const area of brazil.areas || []) {
      const el22 = uf2022.get(area.code)
      if (el22 && area.y2022) {
        area.y2022 = applyEl(area.y2022, el22)
        has22 = true
        addEl(agg22, el22)
      }
      const el26 = uf2026.get(area.code)
      if (el26 && area.y2026) {
        area.y2026 = applyEl(area.y2026, el26)
        has26 = true
        addEl(agg26, el26)
      }
    }
    if (has22 && brazil.y2022) {
      brazil.y2022 = applyEl(brazil.y2022, agg22)
    }
    if (has26 && brazil.y2026) {
      brazil.y2026 = applyEl(brazil.y2026, agg26)
    }
    console.log(
      `Patched Brazil domestic electorate (2022=${has22}, 2026=${has26})`,
    )
  }

  writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2) + '\n')
  console.log('Wrote', RESULTS_PATH)

  // Brazil City + Neighborhood tabs (lazy JSON).
  if (existsSync(BRAZIL_CITIES_PATH) && existsSync(BRAZIL_SUBURBS_PATH)) {
    const citiesDoc = JSON.parse(readFileSync(BRAZIL_CITIES_PATH, 'utf8'))
    const suburbsDoc = JSON.parse(readFileSync(BRAZIL_SUBURBS_PATH, 'utf8'))
    patchBrazilLocals(citiesDoc, suburbsDoc, el2022, el2026Munzona)
  } else {
    console.warn('Skip brazil-cities/suburbs — files missing')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
