#!/usr/bin/env node
/**
 * Build Brazil electoral-zone (Neighborhood tab) runoff tallies.
 *
 * Open-data votacao_secao_2026 still only publishes 1º turno. Runoff zona
 * votes come from TSE EA20 JSON:
 *   /oficial/ele2026/6258/dados/{uf}/{uf}{mun}-z{zona}-c0001-e006258-u.json
 *
 * 2022 runoff (y2022 / swing) is aggregated from votacao_secao_2022_BR.csv
 * with NR_TURNO=2.
 *
 * Labels reuse brazil-suburbs.json when the code matches.
 *
 * Writes: src/data/brazil-suburbs-runoff.json
 *
 * Usage: node scripts/build-brazil-suburbs-runoff.mjs
 *        node scripts/build-brazil-suburbs-runoff.mjs --concurrency=32
 */
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
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
const OUT = join(ROOT, 'src/data/brazil-suburbs-runoff.json')
const LABELS_PATH = join(ROOT, 'src/data/brazil-suburbs.json')
const RESULTS_RUNOFF = join(ROOT, 'src/data/results-runoff.json')

const HOST = 'https://resultados.tse.jus.br'
const AMBIENTE = 'oficial'
const CICLO = 'ele2026'
const ELEICAO = '6258'
const CARGO = '1'

const CDN = 'https://cdn.tse.jus.br'
const ZIP_2022 = `${CDN}/estatistica/sead/odsele/votacao_secao/votacao_secao_2022_BR.zip`
const CSV_2022 = 'votacao_secao_2022_BR.csv'
const CACHE_2022_ZONAS = join(ROOT, 'src/data/tse-brazil-2022-r2-zonas.json')

const UA =
  'eleicoes-exterior/1.0 (+https://github.com/wlad-c/eleicoes-exterior; Brazil zona runoff)'

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

function pad(n, w) {
  return String(n).padStart(w, '0')
}

function parseIntPT(v) {
  if (v == null) return 0
  return Number.parseInt(String(v).replace(/\./g, ''), 10) || 0
}

function round1(n) {
  return Math.round(n * 100) / 100
}

function yearResult(
  lula,
  bolsonaro,
  totalValid,
  registered,
  abstentions,
  blank,
  nullVotes,
) {
  const y = {
    lula,
    bolsonaro,
    totalValid,
    lulaPct: totalValid ? round1((lula / totalValid) * 100) : 0,
    bolsonaroPct: totalValid ? round1((bolsonaro / totalValid) * 100) : 0,
  }
  if (registered == null || registered <= 0) return y
  y.registered = registered
  if (abstentions != null) y.abstentions = abstentions
  if (blank != null) y.blank = blank
  if (nullVotes != null) y.nullVotes = nullVotes
  let noValid
  if (abstentions != null && blank != null && nullVotes != null) {
    noValid = abstentions + blank + nullVotes
  } else {
    noValid = Math.max(0, registered - totalValid)
  }
  y.noValidVote = noValid
  y.noValidVotePct = round1((noValid / registered) * 100)
  return y
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

function swingOf(y2022, y2026) {
  if (!y2022 || !y2026) return null
  const lulaPp = round1(y2026.lulaPct - y2022.lulaPct)
  const bolsonaroPp = round1(y2026.bolsonaroPct - y2022.bolsonaroPct)
  return {
    lulaPp,
    bolsonaroPp,
    marginPp: round1(lulaPp - bolsonaroPp),
  }
}

function coverageOf(doc) {
  const st = parseIntPT(doc.s?.st)
  const ts = parseIntPT(doc.s?.ts)
  if (!ts) return null
  return { counted: st, total: ts }
}

function extractCandidates(doc) {
  const carg =
    (doc.carg || []).find((c) => String(c.cd) === CARGO) || doc.carg?.[0]
  if (!carg) return { lula: 0, bolsonaro: 0 }
  const byNumber = {}
  for (const agr of carg.agr || []) {
    for (const par of agr.par || []) {
      for (const cand of par.cand || []) {
        byNumber[String(cand.n)] = parseIntPT(cand.vap)
      }
    }
  }
  return {
    lula: byNumber['13'] || 0,
    bolsonaro: byNumber['22'] || 0,
  }
}

function totalValidOf(doc, lula, bolsonaro) {
  const vv = parseIntPT(doc.v?.vv || doc.v?.vvc)
  if (vv > 0) return vv
  return lula + bolsonaro
}

function titleCasePt(name) {
  return String(name || '')
    .toLocaleLowerCase('pt-BR')
    .replace(/(^|[\s\-'/])(\S)/g, (_, a, b) => a + b.toLocaleUpperCase('pt-BR'))
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function parseCliArgs(argv) {
  let concurrency = 28
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--concurrency=')) {
      concurrency = Math.max(4, Number(a.slice('--concurrency='.length)) || 28)
    } else if (a === '--concurrency' && argv[i + 1]) {
      concurrency = Math.max(4, Number(argv[++i]) || 28)
    }
  }
  return { concurrency }
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  })
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} for ${url}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

function ea20ZonaUrl(uf, munCode, zona) {
  const folder = uf.toLowerCase()
  const mun = pad(munCode, 5)
  // TSE files use 4-digit zona; our row codes use 3-digit after Z.
  const zFile = pad(zona, 4)
  const file = `${folder}${mun}-z${zFile}-c${pad(CARGO, 4)}-e${pad(ELEICAO, 6)}-u.json`
  return `${HOST}/${AMBIENTE}/${CICLO}/${ELEICAO}/dados/${folder}/${file}`
}

async function mapPool(items, concurrency, fn) {
  const out = new Array(items.length)
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx], idx)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  )
  return out
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

async function ensure2022Csv(work) {
  mkdirSync(work, { recursive: true })
  const zipPath = join(work, CSV_2022.replace('.csv', '.zip'))
  const csvPath = join(work, CSV_2022)
  // Prefer already-extracted CSV from prior syncs.
  for (const candidate of [
    csvPath,
    join(tmpdir(), 'eleicoes-tse-2022', CSV_2022),
  ]) {
    try {
      if (!existsSync(candidate)) continue
      const { size } = await import('node:fs').then((fs) =>
        fs.statSync(candidate),
      )
      if (size > 1_000_000) {
        console.log(`Reusing cached ${candidate}`)
        return candidate
      }
    } catch {
      /* try next */
    }
  }

  console.log(`Downloading ${ZIP_2022}…`)
  const res = await fetch(ZIP_2022, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`Failed to download 2022 zip: HTTP ${res.status}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(zipPath))
  console.log('Extracting CSV…')
  execFileSync('unzip', ['-o', zipPath, CSV_2022, '-d', work], {
    stdio: 'inherit',
  })
  return csvPath
}

/**
 * Aggregate 2022 runoff president votes by UF|mun|zona.
 * Returns Record<code, YearResult-like raw>.
 */
async function build2022ZonaRunoff(csvPath) {
  console.log('Aggregating 2022 runoff (NR_TURNO=2) by electoral zone…')
  const into = new Map()
  let header = null
  const idx = {}
  let rows = 0
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
        'NR_TURNO',
        'CD_CARGO',
        'DS_CARGO',
        'NR_VOTAVEL',
        'QT_VOTOS',
      ]) {
        idx[name] = header.indexOf(name)
      }
      continue
    }
    const cols = parseCsvLine(line)
    const uf = cols[idx.SG_UF]
    if (!uf || uf === 'ZZ' || !UF_META[uf]) continue
    if (cols[idx.NR_TURNO] !== '2') continue
    const cargo = cols[idx.CD_CARGO]
    const dsCargo = (cols[idx.DS_CARGO] || '').toUpperCase()
    if (cargo !== '1' && !dsCargo.includes('PRESIDENTE')) continue
    const nr = String(cols[idx.NR_VOTAVEL] || '')
    if (nr === '95' || nr === '96' || nr === '97') continue
    const votes = Number.parseInt(cols[idx.QT_VOTOS], 10) || 0
    if (!votes) continue
    const zona = pad(cols[idx.NR_ZONA], 3)
    const munCode = pad(cols[idx.CD_MUNICIPIO], 5)
    const munName = cols[idx.NM_MUNICIPIO] || munCode
    const key = `${uf}|${munCode}|${zona}`
    let row = into.get(key)
    if (!row) {
      row = {
        uf,
        munCode,
        munName,
        zona,
        lula: 0,
        bolsonaro: 0,
        totalValid: 0,
      }
      into.set(key, row)
    }
    row.totalValid += votes
    if (nr === '13') row.lula += votes
    else if (nr === '22') row.bolsonaro += votes
    rows += 1
  }
  console.log(`  aggregated ${rows} vote lines → ${into.size} zones`)

  /** @type {Record<string, {lula:number,bolsonaro:number,totalValid:number,munName:string}>} */
  const out = {}
  for (const [key, row] of into) {
    out[key] = {
      lula: row.lula,
      bolsonaro: row.bolsonaro,
      totalValid: row.totalValid,
      munName: row.munName,
    }
  }
  writeFileSync(CACHE_2022_ZONAS, JSON.stringify({ updatedAt: new Date().toISOString(), zonas: out }) + '\n')
  console.log(`  cached → ${CACHE_2022_ZONAS}`)
  return out
}

async function load2022ZonaRunoff() {
  if (existsSync(CACHE_2022_ZONAS)) {
    try {
      const doc = JSON.parse(readFileSync(CACHE_2022_ZONAS, 'utf8'))
      const zonas = doc.zonas || {}
      if (Object.keys(zonas).length > 1000) {
        console.log(
          `Reusing ${CACHE_2022_ZONAS} (${Object.keys(zonas).length} zones)`,
        )
        return zonas
      }
    } catch {
      /* rebuild */
    }
  }
  const work = join(tmpdir(), 'eleicoes-tse-2022')
  const csvPath = await ensure2022Csv(work)
  return build2022ZonaRunoff(csvPath)
}

function loadLabels() {
  /** @type {Map<string, any>} */
  const map = new Map()
  if (!existsSync(LABELS_PATH)) {
    console.warn(`No ${LABELS_PATH} — falling back to Zona NNN labels`)
    return map
  }
  const doc = JSON.parse(readFileSync(LABELS_PATH, 'utf8'))
  for (const row of doc.suburbs || []) {
    if (row?.code) map.set(row.code, row)
  }
  console.log(`Loaded ${map.size} zona labels from brazil-suburbs.json`)
  return map
}

async function main() {
  const { concurrency } = parseCliArgs(process.argv.slice(2))
  const labels = loadLabels()
  const y2022ByKey = await load2022ZonaRunoff()

  console.log(`\nFetching mun config (eleição ${ELEICAO})…`)
  const munCfg = await fetchJson(
    `${HOST}/${AMBIENTE}/${CICLO}/${ELEICAO}/config/mun-e${pad(ELEICAO, 6)}-cm.json`,
  )

  /** @type {{uf:string,munCode:string,munName:string,zona:string,code:string,key:string}[]} */
  const jobs = []
  for (const ufAbr of munCfg.abr || []) {
    const uf = String(ufAbr.cd || '').toUpperCase()
    if (!UF_META[uf]) continue
    for (const mu of ufAbr.mu || []) {
      const munCode = pad(mu.cd, 5)
      const munName = mu.nm || munCode
      for (const zRaw of mu.z || []) {
        const zona = pad(Number.parseInt(String(zRaw), 10) || 0, 3)
        if (zona === '000') continue
        const code = `${uf}-${munCode}-Z${zona}`
        const key = `${uf}|${munCode}|${zona}`
        jobs.push({ uf, munCode, munName, zona, code, key })
      }
    }
  }
  console.log(
    `Fetching ${jobs.length} zona tallies (concurrency=${concurrency})…`,
  )

  let done = 0
  let failed = 0
  const fetched = await mapPool(jobs, concurrency, async (job) => {
    try {
      const doc = await fetchJson(
        ea20ZonaUrl(job.uf, job.munCode, job.zona),
      )
      const cand = extractCandidates(doc)
      const valid = totalValidOf(doc, cand.lula, cand.bolsonaro)
      const electorate = electorateOf(doc)
      done += 1
      if (done % 250 === 0 || done === jobs.length) {
        console.log(`  zonas ${done}/${jobs.length} (failed ${failed})`)
      }
      await sleep(15)
      return {
        ...job,
        y2026: yearResult(
          cand.lula,
          cand.bolsonaro,
          valid,
          electorate?.registered,
          electorate?.abstentions,
          electorate?.blank,
          electorate?.nullVotes,
        ),
        coverage: coverageOf(doc),
      }
    } catch (err) {
      done += 1
      failed += 1
      if (done % 250 === 0 || done === jobs.length) {
        console.log(`  zonas ${done}/${jobs.length} (failed ${failed})`)
      }
      if (failed <= 8) {
        console.warn(`  skip ${job.code}: ${err.message}`)
      }
      return null
    }
  })

  const suburbs = []
  for (const row of fetched) {
    if (!row?.y2026) continue
    const prevRaw = y2022ByKey[row.key]
    const prev = prevRaw
      ? yearResult(prevRaw.lula, prevRaw.bolsonaro, prevRaw.totalValid)
      : null
    const label = labels.get(row.code)
    const munPretty = titleCasePt(row.munName)
    const zonaPt = `Zona ${row.zona}`
    const zonaEn = `Zone ${row.zona}`
    const namePt = label?.namePt || label?.name || zonaPt
    const nameEn = label?.nameEn || label?.name || zonaEn
    const areaPt =
      label?.areaPt || `${row.uf} · ${munPretty} · ${zonaPt}`
    const areaEn =
      label?.areaEn || `${row.uf} · ${munPretty} · ${zonaEn}`
    suburbs.push({
      code: row.code,
      name: namePt,
      nameEn,
      namePt,
      level: 'suburb',
      area: label?.area || `${row.uf} · ${row.munName} · ${zonaPt}`,
      areaEn,
      areaPt,
      y2026: row.y2026,
      y2022: prev,
      swing: swingOf(prev, row.y2026),
      coverage: row.coverage,
      ...(label?.lat != null ? { lat: label.lat, lon: label.lon } : {}),
    })
  }

  suburbs.sort((a, b) => {
    const area = a.area.localeCompare(b.area, 'pt')
    if (area !== 0) return area
    return a.name.localeCompare(b.name, 'pt', { numeric: true })
  })

  writeFileSync(
    OUT,
    JSON.stringify(
      {
        countryId: 'brazil',
        grain: 'zona',
        round: 2,
        election: ELEICAO,
        labelSource: 'brazil-suburbs.json + TSE EA20 zona',
        updatedAt: new Date().toISOString(),
        count: suburbs.length,
        failed,
        suburbs,
      },
      null,
      0,
    ) + '\n',
  )
  console.log(
    `\nWrote ${suburbs.length} runoff zonas (${failed} failed) → ${OUT}`,
  )

  try {
    const results = JSON.parse(readFileSync(RESULTS_RUNOFF, 'utf8'))
    const br = results.countries.find((c) => c.id === 'brazil')
    if (br) {
      br.suburbCount = suburbs.length
      br.suburbs = []
      writeFileSync(RESULTS_RUNOFF, JSON.stringify(results, null, 2) + '\n')
      console.log(`Updated results-runoff.json suburbCount=${suburbs.length}`)
    }
  } catch (err) {
    console.warn(`Could not update results-runoff suburbCount: ${err.message}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
