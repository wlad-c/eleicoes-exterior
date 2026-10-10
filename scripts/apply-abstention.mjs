#!/usr/bin/env node
/**
 * Attach registered / abstention fields to YearResult payloads:
 *   - 2022 ZZ areas + countries from detalhe_votacao_munzona (QT_APTOS / QT_ABSTENCOES)
 *   - 2026 ZZ areas + countries from TSE EA20 `e.te` / `e.a`
 *   - Brazil national + UF areas (2022 munzona + 2026 EA20)
 *
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

const HOST = 'https://resultados.tse.jus.br'
const AMBIENTE = 'oficial'
const CICLO = 'ele2026'
const ELEICAO = '6257'
const CARGO = '1'
const UA = 'eleicoes-exterior/1.0 (+abstention overlay)'
const CDN = 'https://cdn.tse.jus.br'
const MUNZONA_ZIP = `${CDN}/estatistica/sead/odsele/detalhe_votacao_munzona/detalhe_votacao_munzona_2022.zip`

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

function withElectorate(y, registered, abstentions) {
  if (!y || registered == null || registered <= 0 || abstentions == null) return y
  return {
    ...y,
    registered,
    abstentions,
    abstentionPct: round1((abstentions / registered) * 100),
  }
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
  const abstentions = parseIntPT(doc?.e?.a)
  if (registered <= 0) return null
  return { registered, abstentions }
}

/**
 * President 1st-round electorate from detalhe_votacao_munzona BRASIL CSV.
 * Returns `{ zz: Map(mun→el), ufs: Map(UF→el) }`.
 * (Per-UF munzona files omit cargo Presidente — only BRASIL has it.)
 */
async function loadMunzona2022Electorate() {
  const work = join(tmpdir(), 'eleicoes-abstention')
  mkdirSync(work, { recursive: true })
  const zipPath = join(work, 'detalhe_votacao_munzona_2022.zip')
  await download(MUNZONA_ZIP, zipPath)
  const csvName = 'detalhe_votacao_munzona_2022_BRASIL.csv'
  const csvPath = join(work, csvName)
  if (!existsSync(csvPath)) {
    execFileSync('unzip', ['-o', zipPath, csvName, '-d', work], { stdio: 'inherit' })
  }

  const byMun = new Map()
  const byUf = new Map()
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
    if (uf === 'ZZ') {
      const mun = pad(cols[idx.CD_MUNICIPIO] || '', 5)
      if (!mun || mun === '00000') continue
      const agg = byMun.get(mun) || { registered: 0, abstentions: 0 }
      agg.registered += registered
      agg.abstentions += abstentions
      byMun.set(mun, agg)
    } else if (UFS.includes(uf)) {
      const agg = byUf.get(uf) || { registered: 0, abstentions: 0 }
      agg.registered += registered
      agg.abstentions += abstentions
      byUf.set(uf, agg)
    }
  }
  console.log(
    `2022 electorate: ${byMun.size} ZZ municipalities, ${byUf.size} UFs`,
  )
  return { zz: byMun, ufs: byUf }
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

  const { zz: zz2022, ufs: uf2022 } = await loadMunzona2022Electorate()
  let patchedCity2022 = 0
  for (const [code, el] of zz2022) {
    const row = city2022[code]
    if (!row) continue
    city2022[code] = withElectorate(row, el.registered, el.abstentions)
    patchedCity2022++
  }
  writeFileSync(CITY_2022_PATH, JSON.stringify(city2022, null, 2) + '\n')
  console.log(`Patched tse-city-2022.json electorate on ${patchedCity2022} areas`)

  // Aggregate 2022 ZZ electorate by country.
  const country2022 = new Map()
  for (const [code, el] of zz2022) {
    const countryId = cityMap[code]
    if (!countryId) continue
    const agg = country2022.get(countryId) || { registered: 0, abstentions: 0 }
    agg.registered += el.registered
    agg.abstentions += el.abstentions
    country2022.set(countryId, agg)
  }

  // Patch area y2022 from city2022; country y2022 from aggregate.
  let areaY2022 = 0
  let countryY2022 = 0
  for (const country of results.countries) {
    if (country.domestic) continue
    const el = country2022.get(country.id)
    if (el && country.y2022) {
      country.y2022 = withElectorate(country.y2022, el.registered, el.abstentions)
      countryY2022++
    }
    for (const area of country.areas || []) {
      const raw = city2022[area.code]
      if (!raw || !area.y2022) continue
      area.y2022 = withElectorate(area.y2022, raw.registered, raw.abstentions)
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

  const country2026 = new Map()
  let areaY2026 = 0
  let countryY2026 = 0
  for (const country of results.countries) {
    if (country.domestic) continue
    let registered = 0
    let abstentions = 0
    let has = false
    for (const area of country.areas || []) {
      const el = munElectorate.get(area.code)
      if (!el || !area.y2026) continue
      area.y2026 = withElectorate(area.y2026, el.registered, el.abstentions)
      areaY2026++
      has = true
      registered += el.registered
      abstentions += el.abstentions
    }
    // Prefer sum of areas; fall back to country-level map of known muns.
    if (!has) {
      for (const [code, el] of munElectorate) {
        if (cityMap[code] !== country.id) continue
        has = true
        registered += el.registered
        abstentions += el.abstentions
      }
    }
    if (has && country.y2026) {
      country.y2026 = withElectorate(country.y2026, registered, abstentions)
      country2026.set(country.id, { registered, abstentions })
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
    let reg22 = 0
    let abs22 = 0
    let has22 = false
    let reg26 = 0
    let abs26 = 0
    let has26 = false
    for (const area of brazil.areas || []) {
      const el22 = uf2022.get(area.code)
      if (el22 && area.y2022) {
        area.y2022 = withElectorate(area.y2022, el22.registered, el22.abstentions)
        has22 = true
        reg22 += el22.registered
        abs22 += el22.abstentions
      }
      const el26 = uf2026.get(area.code)
      if (el26 && area.y2026) {
        area.y2026 = withElectorate(area.y2026, el26.registered, el26.abstentions)
        has26 = true
        reg26 += el26.registered
        abs26 += el26.abstentions
      }
    }
    if (has22 && brazil.y2022) {
      brazil.y2022 = withElectorate(brazil.y2022, reg22, abs22)
    }
    if (has26 && brazil.y2026) {
      brazil.y2026 = withElectorate(brazil.y2026, reg26, abs26)
    }
    console.log(
      `Patched Brazil domestic electorate (2022=${has22}, 2026=${has26})`,
    )
  }

  writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2) + '\n')
  console.log('Wrote', RESULTS_PATH)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
