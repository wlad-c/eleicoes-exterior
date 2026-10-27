#!/usr/bin/env node
/**
 * Build Brazil voting-place (local de votação) runoff tallies for the Nexo-style
 * point map — one marker per NM_LOCAL_VOTACAO / NR_LOCAL_VOTACAO, aggregating
 * every BU (seção) at that building.
 *
 * Sources:
 *   - votacao_secao_2026_BR.csv  NR_TURNO=2, CD_CARGO=1
 *   - votacao_secao_2022_BR.csv  NR_TURNO=2, CD_CARGO=1  (y2022 / swing)
 *   - eleitorado_local_votacao_2026_*.csv  NR_LATITUDE / NR_LONGITUDE
 *
 * Grain is deliberately *local* (≈94k), not seção (≈500k) and not zona (≈6k).
 * Nexo / ElectoMaps / Arvor all colour voting places; seções at the same
 * school share one coordinate.
 *
 * Writes:
 *   src/data/brazil-locais-runoff/index.json
 *   src/data/brazil-locais-runoff/{UF}.json   (compact row arrays)
 *
 * Compact row:
 *   [mun5, zona3, nrLocal, name, lat|null, lon|null,
 *    lula26, bolso26, valid26, lula22, bolso22, valid22]
 *
 * Usage: node scripts/build-brazil-locais-runoff.mjs
 *        ELEITORADO_DIR=/path node scripts/build-brazil-locais-runoff.mjs
 */
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  writeFileSync,
  statSync,
} from 'node:fs'
import { createInterface } from 'node:readline'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_DIR = join(ROOT, 'src/data/brazil-locais-runoff')
const PUBLIC_DIR = join(ROOT, 'public/data/brazil-locais-runoff')
const DOCS_DIR = join(ROOT, 'docs/data/brazil-locais-runoff')

const CDN = 'https://cdn.tse.jus.br'
const UA =
  'eleicoes-exterior/1.0 (+https://github.com/wlad-c/eleicoes-exterior; Brazil locais runoff)'

const ZIP_2026 = `${CDN}/estatistica/sead/odsele/votacao_secao/votacao_secao_2026_BR.zip`
const CSV_2026 = 'votacao_secao_2026_BR.csv'
const ZIP_2022 = `${CDN}/estatistica/sead/odsele/votacao_secao/votacao_secao_2022_BR.zip`
const CSV_2022 = 'votacao_secao_2022_BR.csv'
const BAIRRO_ZIP = `${CDN}/estatistica/sead/odsele/eleitorado_locais_votacao/eleitorado_local_votacao_2026.zip`

const UF_META = {
  AC: { en: 'Acre', pt: 'Acre' },
  AL: { en: 'Alagoas', pt: 'Alagoas' },
  AP: { en: 'Amapá', pt: 'Amapá' },
  AM: { en: 'Amazonas', pt: 'Amazonas' },
  BA: { en: 'Bahia', pt: 'Bahia' },
  CE: { en: 'Ceará', pt: 'Ceará' },
  DF: { en: 'Federal District', pt: 'Distrito Federal' },
  ES: { en: 'Espírito Santo', pt: 'Espírito Santo' },
  GO: { en: 'Goiás', pt: 'Goiás' },
  MA: { en: 'Maranhão', pt: 'Maranhão' },
  MT: { en: 'Mato Grosso', pt: 'Mato Grosso' },
  MS: { en: 'Mato Grosso do Sul', pt: 'Mato Grosso do Sul' },
  MG: { en: 'Minas Gerais', pt: 'Minas Gerais' },
  PA: { en: 'Pará', pt: 'Pará' },
  PB: { en: 'Paraíba', pt: 'Paraíba' },
  PR: { en: 'Paraná', pt: 'Paraná' },
  PE: { en: 'Pernambuco', pt: 'Pernambuco' },
  PI: { en: 'Piauí', pt: 'Piauí' },
  RJ: { en: 'Rio de Janeiro', pt: 'Rio de Janeiro' },
  RN: { en: 'Rio Grande do Norte', pt: 'Rio Grande do Norte' },
  RS: { en: 'Rio Grande do Sul', pt: 'Rio Grande do Sul' },
  RO: { en: 'Rondônia', pt: 'Rondônia' },
  RR: { en: 'Roraima', pt: 'Roraima' },
  SC: { en: 'Santa Catarina', pt: 'Santa Catarina' },
  SP: { en: 'São Paulo', pt: 'São Paulo' },
  SE: { en: 'Sergipe', pt: 'Sergipe' },
  TO: { en: 'Tocantins', pt: 'Tocantins' },
}

const UF_LIST = Object.keys(UF_META)

function pad(n, w) {
  return String(n).padStart(w, '0')
}

function round6(n) {
  return Math.round(n * 1e6) / 1e6
}

function parseCoord(raw) {
  if (raw == null || raw === '' || raw === '-1' || raw === '-1,0') return null
  const n = Number.parseFloat(String(raw).replace(',', '.'))
  return Number.isFinite(n) ? n : null
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
  return cols
}

async function download(url, dest) {
  mkdirSync(dirname(dest), { recursive: true })
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
}

async function ensureZipCsv(work, zipUrl, csvName, cacheHints = []) {
  mkdirSync(work, { recursive: true })
  const zipPath = join(work, csvName.replace('.csv', '.zip'))
  const csvPath = join(work, csvName)
  for (const candidate of [csvPath, ...cacheHints]) {
    try {
      if (existsSync(candidate) && statSync(candidate).size > 1_000_000) {
        console.log(`Reusing ${candidate}`)
        return candidate
      }
    } catch {
      /* next */
    }
  }
  if (!existsSync(zipPath) || statSync(zipPath).size < 1000) {
    console.log(`Downloading ${zipUrl}…`)
    await download(zipUrl, zipPath)
  }
  console.log(`Extracting ${csvName}…`)
  execFileSync('unzip', ['-o', zipPath, csvName, '-d', work], {
    stdio: 'inherit',
  })
  return csvPath
}

/**
 * Aggregate president votes by uf|mun|zona|nrLocal.
 * @returns {Map<string, {uf,mun,zona,nrLocal,name,munName,lula,bolsonaro,totalValid,secoes:Set}>}
 */
async function aggregateLocais(csvPath, turno) {
  console.log(`Aggregating turno=${turno} from ${csvPath}…`)
  /** @type {Map<string, any>} */
  const into = new Map()
  let header = null
  const idx = {}
  let rows = 0
  let kept = 0
  const rl = createInterface({
    input: createReadStream(csvPath, { encoding: 'latin1' }),
    crlfDelay: Infinity,
  })
  for await (const line of rl) {
    if (!header) {
      header = parseCsvLine(line).map((h) => h.replace(/^\uFEFF/, ''))
      for (const name of [
        'SG_UF',
        'CD_MUNICIPIO',
        'NM_MUNICIPIO',
        'NR_ZONA',
        'NR_SECAO',
        'NR_TURNO',
        'CD_CARGO',
        'DS_CARGO',
        'NR_VOTAVEL',
        'QT_VOTOS',
        'NR_LOCAL_VOTACAO',
        'NM_LOCAL_VOTACAO',
      ]) {
        idx[name] = header.indexOf(name)
      }
      if (idx.NR_LOCAL_VOTACAO < 0 || idx.NM_LOCAL_VOTACAO < 0) {
        throw new Error('votacao_secao missing NR/NM_LOCAL_VOTACAO')
      }
      continue
    }
    rows += 1
    const cols = parseCsvLine(line)
    if (cols[idx.NR_TURNO] !== String(turno)) continue
    const cargo = cols[idx.CD_CARGO]
    const dsCargo = (cols[idx.DS_CARGO] || '').toUpperCase()
    if (cargo !== '1' && !dsCargo.includes('PRESIDENTE')) continue
    const uf = cols[idx.SG_UF]
    if (!uf || uf === 'ZZ' || !UF_META[uf]) continue
    const nr = String(cols[idx.NR_VOTAVEL] || '')
    // Skip blank/null/nulo markers — only candidate votes into totalValid.
    if (nr === '95' || nr === '96' || nr === '97') continue
    const votes = Number.parseInt(cols[idx.QT_VOTOS], 10) || 0
    if (!votes) continue
    const mun = pad(cols[idx.CD_MUNICIPIO], 5)
    const zona = pad(cols[idx.NR_ZONA], 3)
    const nrLocal = pad(cols[idx.NR_LOCAL_VOTACAO], 4)
    const secao = pad(cols[idx.NR_SECAO], 4)
    const key = `${uf}|${mun}|${zona}|${nrLocal}`
    let row = into.get(key)
    if (!row) {
      row = {
        uf,
        mun,
        zona,
        nrLocal,
        name: cols[idx.NM_LOCAL_VOTACAO] || `Local ${nrLocal}`,
        munName: cols[idx.NM_MUNICIPIO] || mun,
        lula: 0,
        bolsonaro: 0,
        totalValid: 0,
        secoes: new Set(),
      }
      into.set(key, row)
    }
    row.totalValid += votes
    if (nr === '13') row.lula += votes
    else if (nr === '22') row.bolsonaro += votes
    row.secoes.add(secao)
    kept += 1
    if (rows % 2_000_000 === 0) {
      console.log(
        `  scanned ${rows} lines → ${into.size} locais (kept ${kept})`,
      )
    }
  }
  console.log(
    `  done: ${rows} lines → ${into.size} locais (vote lines ${kept})`,
  )
  return into
}

async function ensureEleitoradoDir() {
  const env = process.env.ELEITORADO_DIR
  if (env && existsSync(join(env, 'eleitorado_local_votacao_2026_AC.csv'))) {
    return env
  }
  for (const dir of [
    '/tmp/eleitorado-locais',
    join(tmpdir(), 'eleicoes-brazil-locals'),
  ]) {
    if (existsSync(join(dir, 'eleitorado_local_votacao_2026_AC.csv'))) return dir
    if (existsSync(join(dir, 'eleitorado_local_votacao_2026.zip'))) return dir
  }
  const dir = '/tmp/eleitorado-locais'
  mkdirSync(dir, { recursive: true })
  const zipPath = join(dir, 'eleitorado_local_votacao_2026.zip')
  if (!existsSync(zipPath) || statSync(zipPath).size < 1000) {
    console.log(`Downloading ${BAIRRO_ZIP}…`)
    await download(BAIRRO_ZIP, zipPath)
  }
  return dir
}

/**
 * Map uf|mun|zona|nrLocal → {lat,lon,bairro} using turno-2 (else turno-1) rows.
 */
async function loadLocalCoords(dir) {
  console.log(`Loading local coordinates from ${dir}…`)
  /** @type {Map<string, {lat:number,lon:number,bairro:string,w:number}>} */
  const acc = new Map()
  let used = 0
  let skipped = 0

  for (const uf of UF_LIST) {
    const entry = `eleitorado_local_votacao_2026_${uf}.csv`
    let csvPath = join(dir, entry)
    if (!existsSync(csvPath) || statSync(csvPath).size < 10_000) {
      const zipPath = join(dir, 'eleitorado_local_votacao_2026.zip')
      if (!existsSync(zipPath)) {
        console.warn(`  skip ${uf}: no csv/zip`)
        continue
      }
      execFileSync('unzip', ['-o', '-j', zipPath, entry, '-d', dir], {
        stdio: 'pipe',
      })
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
        header = parseCsvLine(line).map((h) =>
          h.replace(/^\uFEFF/, '').replace(/^"|"$/g, ''),
        )
        for (const name of [
          'SG_UF',
          'CD_MUNICIPIO',
          'NR_ZONA',
          'NR_TURNO',
          'NR_LOCAL_VOTACAO',
          'NM_LOCAL_VOTACAO',
          'NM_BAIRRO',
          'NR_LATITUDE',
          'NR_LONGITUDE',
          'QT_ELEITOR_SECAO',
        ]) {
          idx[name] = header.indexOf(name)
        }
        continue
      }
      const cols = parseCsvLine(line).map((c) => c.replace(/^"|"$/g, ''))
      // Prefer 2º turno coordinates (same election night as runoff BUs).
      const turno = cols[idx.NR_TURNO]
      if (turno !== '2' && turno !== '1') continue
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
      if (lat > 10 || lon > -20) {
        skipped += 1
        continue
      }
      const rowUf = (cols[idx.SG_UF] || uf).toUpperCase()
      const mun = pad(cols[idx.CD_MUNICIPIO], 5)
      const zona = pad(cols[idx.NR_ZONA], 3)
      const nrLocal = pad(cols[idx.NR_LOCAL_VOTACAO], 4)
      const w = Number.parseInt(cols[idx.QT_ELEITOR_SECAO], 10) || 1
      const key = `${rowUf}|${mun}|${zona}|${nrLocal}`
      const prefer = turno === '2' ? 2 : 1
      const prev = acc.get(key)
      if (prev && (prev.turno ?? 0) > prefer) continue
      if (prev && (prev.turno ?? 0) === prefer) {
        prev.latSum += lat * w
        prev.lonSum += lon * w
        prev.w += w
        used += 1
        ufUsed += 1
        continue
      }
      acc.set(key, {
        latSum: lat * w,
        lonSum: lon * w,
        w,
        turno: prefer,
        bairro: cols[idx.NM_BAIRRO] || '',
        name: cols[idx.NM_LOCAL_VOTACAO] || '',
      })
      used += 1
      ufUsed += 1
    }
    console.log(` ${ufUsed}`)
  }

  /** @type {Map<string, {lat:number,lon:number,bairro:string}>} */
  const out = new Map()
  for (const [key, bag] of acc) {
    if (!bag.w) continue
    out.set(key, {
      lat: round6(bag.latSum / bag.w),
      lon: round6(bag.lonSum / bag.w),
      bairro: bag.bairro,
    })
  }
  console.log(
    `Coords: ${out.size} locais (${used} section rows, ${skipped} skipped)`,
  )
  return out
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const work26 = join(tmpdir(), 'eleicoes-tse-2026-secao')
  const work22 = join(tmpdir(), 'eleicoes-tse-2022')

  const csv26 = await ensureZipCsv(work26, ZIP_2026, CSV_2026, [
    '/tmp/votacao-secao-2026/votacao_secao_2026_BR.csv',
  ])
  // Prefer already-extracted zip under /tmp from earlier probes.
  if (
    !existsSync(join(work26, 'votacao_secao_2026_BR.zip')) &&
    existsSync('/tmp/votacao-secao-2026/votacao_secao_2026_BR.zip')
  ) {
    /* ok — csv path already resolved */
  }

  const y2026 = await aggregateLocais(csv26, 2)

  const csv22 = await ensureZipCsv(work22, ZIP_2022, CSV_2022, [
    join(tmpdir(), 'eleicoes-tse-2022', CSV_2022),
  ])
  const y2022 = await aggregateLocais(csv22, 2)

  const eleDir = await ensureEleitoradoDir()
  const coords = await loadLocalCoords(eleDir)

  /** @type {Map<string, any[]>} */
  const byUf = new Map()
  for (const uf of UF_LIST) byUf.set(uf, [])

  let withCoords = 0
  let with2022 = 0
  for (const [key, row] of y2026) {
    const prev = y2022.get(key)
    const geo = coords.get(key)
    if (geo) withCoords += 1
    if (prev) with2022 += 1
    const compact = [
      row.mun,
      row.zona,
      row.nrLocal,
      row.name,
      geo ? geo.lat : null,
      geo ? geo.lon : null,
      row.lula,
      row.bolsonaro,
      row.totalValid,
      prev ? prev.lula : 0,
      prev ? prev.bolsonaro : 0,
      prev ? prev.totalValid : 0,
      row.secoes.size,
      row.munName,
      geo?.bairro || '',
    ]
    byUf.get(row.uf).push(compact)
  }

  const ufStats = []
  let total = 0
  for (const uf of UF_LIST) {
    const rows = byUf.get(uf)
    rows.sort((a, b) => {
      const mun = String(a[0]).localeCompare(String(b[0]))
      if (mun) return mun
      const z = String(a[1]).localeCompare(String(b[1]))
      if (z) return z
      return String(a[2]).localeCompare(String(b[2]))
    })
    const path = join(OUT_DIR, `${uf}.json`)
    const body = {
      uf,
      grain: 'local',
      round: 2,
      election: '6258',
      count: rows.length,
      withCoords: rows.filter((r) => r[4] != null).length,
      // Compact rows — see file header comment.
      cols: [
        'mun',
        'zona',
        'nrLocal',
        'name',
        'lat',
        'lon',
        'lula26',
        'bolso26',
        'valid26',
        'lula22',
        'bolso22',
        'valid22',
        'secoes',
        'munName',
        'bairro',
      ],
      locais: rows,
    }
    writeFileSync(path, JSON.stringify(body) + '\n')
    const bytes = statSync(path).size
    console.log(`  ${uf}: ${rows.length} locais (${(bytes / 1e6).toFixed(2)} MB)`)
    ufStats.push({
      uf,
      count: rows.length,
      withCoords: body.withCoords,
      bytes,
    })
    total += rows.length
  }

  const index = {
    countryId: 'brazil',
    grain: 'local',
    round: 2,
    election: '6258',
    labelSource:
      'votacao_secao (NR_LOCAL_VOTACAO) + eleitorado_local_votacao coords',
    updatedAt: new Date().toISOString(),
    count: total,
    withCoords,
    with2022,
    ufs: ufStats,
  }
  writeFileSync(join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2) + '\n')
  console.log(
    `\nWrote ${total} locais (${withCoords} with coords, ${with2022} with 2022) → ${OUT_DIR}`,
  )

  for (const dest of [PUBLIC_DIR, DOCS_DIR]) {
    mkdirSync(dest, { recursive: true })
    execFileSync('cp', ['-a', `${OUT_DIR}/.`, dest], { stdio: 'inherit' })
    console.log(`Synced → ${dest}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
