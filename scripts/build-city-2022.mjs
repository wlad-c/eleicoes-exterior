#!/usr/bin/env node
/**
 * Build 2022 overseas presidential totals by TSE ZZ municipality and by
 * voting local (NM_LOCAL_VOTACAO) from official TSE open data:
 *   votacao_secao_2022_BR.zip (UF ZZ, 1º turno, Presidente)
 *
 * Writes:
 *   src/data/tse-city-2022.json      — mun code → YearResult
 *   src/data/tse-location-2022.json  — mun code → { localName → YearResult }
 *
 * Usage: node scripts/build-city-2022.mjs
 */
import { createWriteStream, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
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
const CITY_OUT = join(ROOT, 'src/data/tse-city-2022.json')
const LOC_OUT = join(ROOT, 'src/data/tse-location-2022.json')

const CDN = 'https://cdn.tse.jus.br'
const UA = 'eleicoes-exterior/1.0 (+2022 city/location builder)'
const ZIP_URL = `${CDN}/estatistica/sead/odsele/votacao_secao/votacao_secao_2022_BR.zip`
const CSV_NAME = 'votacao_secao_2022_BR.csv'

function pad(n, w) {
  return String(n).padStart(w, '0')
}

function round1(n) {
  return Math.round(n * 100) / 100
}

function yearResult(lula, bolsonaro, totalValid) {
  return {
    lula,
    bolsonaro,
    totalValid,
    lulaPct: totalValid ? round1((lula / totalValid) * 100) : 0,
    bolsonaroPct: totalValid ? round1((bolsonaro / totalValid) * 100) : 0,
  }
}

/** Same cleaner as build-location-map.mjs so 2026 keys match 2022 locals. */
function cleanLocalName(raw) {
  let s = String(raw || '')
    .normalize('NFKC')
    .trim()
  if (!s) return null
  const cons = s.match(/CONSULADO EM\s+([^)]+)\)/i)
  if (cons) return cons[1].trim().replace(/\s+/g, ' ')
  const parte = s.match(/PARTE DE\s+([^)]+)\)/i)
  if (parte) return parte[1].trim().replace(/\s+/g, ' ')
  if (s.includes(' - ')) s = s.split(' - ').pop().trim()
  s = s.replace(/\s*\([^)]*\)\s*/g, ' ').trim()
  s = s.replace(/\s+/g, ' ')
  return s || null
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
  console.log('Downloading', url)
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
  return dest
}

async function main() {
  const work = join(tmpdir(), 'eleicoes-city2022')
  mkdirSync(work, { recursive: true })
  const zipPath = join(work, 'votacao_secao_2022_BR.zip')
  const csvPath = join(work, CSV_NAME)

  await download(ZIP_URL, zipPath)
  console.log('Extracting CSV…')
  execFileSync('unzip', ['-o', zipPath, CSV_NAME, '-d', work], {
    stdio: 'inherit',
  })

  /** mun → Map(loc → {lula,bolso,valid}) */
  const byMun = new Map()
  const munNames = new Map()

  const rl = createInterface({
    input: createReadStream(csvPath, { encoding: 'latin1' }),
    crlfDelay: Infinity,
  })

  let header = null
  let idx = {}
  let rows = 0
  let kept = 0

  for await (const line of rl) {
    if (!header) {
      header = parseCsvLine(line)
      header.forEach((h, i) => {
        idx[h] = i
      })
      continue
    }
    rows++
    const cols = parseCsvLine(line)
    if (cols[idx.SG_UF] !== 'ZZ') continue
    if (cols[idx.NR_TURNO] !== '1') continue
    const cargo = (cols[idx.DS_CARGO] || '').toUpperCase()
    const cdCargo = cols[idx.CD_CARGO]
    if (cargo !== 'PRESIDENTE' && cdCargo !== '1' && cdCargo !== '01') continue
    const nr = cols[idx.NR_VOTAVEL]
    if (nr === '95' || nr === '96') continue // branco / nulo
    const votes = Number.parseInt(cols[idx.QT_VOTOS] || '0', 10) || 0
    const mun = pad(cols[idx.CD_MUNICIPIO] || '', 5)
    if (!mun || mun === '00000') continue
    const munName = cols[idx.NM_MUNICIPIO] || mun
    munNames.set(mun, munName)
    const loc =
      cleanLocalName(cols[idx.NM_LOCAL_VOTACAO]) || munName
    if (!byMun.has(mun)) byMun.set(mun, new Map())
    const locMap = byMun.get(mun)
    if (!locMap.has(loc)) locMap.set(loc, { lula: 0, bolso: 0, valid: 0 })
    const agg = locMap.get(loc)
    agg.valid += votes
    if (nr === '13') agg.lula += votes
    if (nr === '22') agg.bolso += votes
    kept++
  }

  const cityOut = {}
  const locOut = {}
  for (const [mun, locMap] of [...byMun.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    let lula = 0
    let bolso = 0
    let valid = 0
    const locations = {}
    for (const [loc, a] of [...locMap.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], 'pt'),
    )) {
      locations[loc] = yearResult(a.lula, a.bolso, a.valid)
      lula += a.lula
      bolso += a.bolso
      valid += a.valid
    }
    cityOut[mun] = {
      name: munNames.get(mun) || mun,
      ...yearResult(lula, bolso, valid),
    }
    locOut[mun] = locations
  }

  writeFileSync(CITY_OUT, JSON.stringify(cityOut, null, 2) + '\n')
  writeFileSync(LOC_OUT, JSON.stringify(locOut, null, 2) + '\n')

  // Sanity: compare a few country rollups to seed results.json
  const results = JSON.parse(readFileSync(join(ROOT, 'src/data/results.json'), 'utf8'))
  const cityToCountry = JSON.parse(
    readFileSync(join(ROOT, 'src/data/tse-city-map.json'), 'utf8'),
  )
  const byCountry = new Map()
  for (const [mun, y] of Object.entries(cityOut)) {
    const id = cityToCountry[mun]
    if (!id) continue
    const agg = byCountry.get(id) || { lula: 0, bolsonaro: 0, totalValid: 0 }
    agg.lula += y.lula
    agg.bolsonaro += y.bolsonaro
    agg.totalValid += y.totalValid
    byCountry.set(id, agg)
  }
  let mismatches = 0
  for (const c of results.countries) {
    const agg = byCountry.get(c.id)
    if (!agg || !c.y2022) continue
    if (
      agg.lula !== c.y2022.lula ||
      agg.bolsonaro !== c.y2022.bolsonaro ||
      agg.totalValid !== c.y2022.totalValid
    ) {
      mismatches++
      console.warn('mismatch', c.id, agg, c.y2022)
    }
  }

  console.log(
    JSON.stringify(
      {
        scannedRows: rows,
        zzVoteRows: kept,
        municipalities: Object.keys(cityOut).length,
        locations: Object.values(locOut).reduce((n, m) => n + Object.keys(m).length, 0),
        countryMismatches: mismatches,
        cityOut: CITY_OUT,
        locOut: LOC_OUT,
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
