#!/usr/bin/env node
/**
 * Sync domestic Brazil presidential tallies (1st round) into results.json.
 *
 * Hierarchy for the Brazil country row:
 *   country  → national BR (excludes ZZ overseas)
 *   areas[]  → 27 UFs (states + DF) — Area tab
 *   cities   → municipalities (lazy brazil-cities.json) — City tab
 *   suburbs  → electoral zones inside munis (build:brazil-locals) — Zona tab
 *
 * 2026: official TSE EA20 JSON
 * 2022: official TSE open data votacao_secao_2022_BR.csv (streamed)
 *
 * Usage: node scripts/sync-tse-brazil.mjs
 *        npm run build:brazil-locals   # within-municipality electoral zones
 */
import {
  createReadStream,
  createWriteStream,
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
const RESULTS_PATH = join(ROOT, 'src/data/results.json')
const CITIES_PATH = join(ROOT, 'src/data/brazil-cities.json')
const BRAZIL_2022_CACHE = join(ROOT, 'src/data/tse-brazil-2022.json')

const HOST = 'https://resultados.tse.jus.br'
const AMBIENTE = 'oficial'
const CICLO = 'ele2026'
const ELEICAO = '6257'
const CARGO = '1'

const CDN = 'https://cdn.tse.jus.br'
const ZIP_URL = `${CDN}/estatistica/sead/odsele/votacao_secao/votacao_secao_2022_BR.zip`
const CSV_NAME = 'votacao_secao_2022_BR.csv'

const UA =
  'eleicoes-exterior/1.0 (+https://github.com/wlad-c/eleicoes-exterior; Brazil domestic sync)'

/** UF code → display names */
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

const UFS = Object.keys(UF_META)

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
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

function ea20Url(abr, municipioCode = '') {
  const folder = abr.toLowerCase()
  const mun = municipioCode ? pad(municipioCode, 5) : ''
  const file = `${folder}${mun}-c${pad(CARGO, 4)}-e${pad(ELEICAO, 6)}-u.json`
  return `${HOST}/${AMBIENTE}/${CICLO}/${ELEICAO}/dados/${folder}/${file}`
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

function coverageOf(doc) {
  const st = parseIntPT(doc.s?.st)
  const ts = parseIntPT(doc.s?.ts)
  if (!ts) return null
  return { counted: st, total: ts }
}

function totalValidOf(doc, lula, bolsonaro) {
  const vv = parseIntPT(doc.v?.vv || doc.v?.vvc)
  if (vv > 0) return vv
  return lula + bolsonaro
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
  const zipPath = join(work, 'votacao_secao_2022_BR.zip')
  const csvPath = join(work, CSV_NAME)
  try {
    const st = await import('node:fs').then((fs) => fs.statSync(csvPath))
    if (st.size > 1_000_000) {
      console.log(`Reusing cached ${csvPath}`)
      return csvPath
    }
  } catch {
    /* download */
  }

  console.log('Downloading votacao_secao_2022_BR.zip…')
  const res = await fetch(ZIP_URL, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`Failed to download 2022 zip: HTTP ${res.status}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(zipPath))
  console.log('Extracting CSV…')
  execFileSync('unzip', ['-o', zipPath, CSV_NAME, '-d', work], {
    stdio: 'inherit',
  })
  return csvPath
}

/**
 * Aggregate 2022 1st-round President votes by UF and by município.
 * Excludes overseas ZZ.
 */
async function build2022Domestic(csvPath) {
  console.log('Aggregating 2022 domestic votes by UF and municipality…')
  const idx = {}
  const byUf = new Map()
  const byMun = new Map() // key: UF|munCode
  let national = { lula: 0, bolsonaro: 0, totalValid: 0 }
  let header = null

  const rl = createInterface({
    input: createReadStream(csvPath),
    crlfDelay: Infinity,
  })

  for await (const line of rl) {
    if (!header) {
      header = parseCsvLine(line).map((h) => h.replace(/^\uFEFF/, ''))
      for (const name of [
        'SG_UF',
        'CD_MUNICIPIO',
        'NM_MUNICIPIO',
        'NR_TURNO',
        'CD_CARGO',
        'NR_VOTAVEL',
        'QT_VOTOS',
        'DS_CARGO',
      ]) {
        idx[name] = header.indexOf(name)
      }
      continue
    }
    const cols = parseCsvLine(line)
    const uf = cols[idx.SG_UF]
    if (!uf || uf === 'ZZ' || !UF_META[uf]) continue
    if (cols[idx.NR_TURNO] !== '1') continue
    const cargo = cols[idx.CD_CARGO]
    const dsCargo = (cols[idx.DS_CARGO] || '').toUpperCase()
    if (cargo !== '1' && !dsCargo.includes('PRESIDENTE')) continue

    const nr = String(cols[idx.NR_VOTAVEL] || '')
    // Skip blank (95) and null (96) — they are not valid votes
    if (nr === '95' || nr === '96' || nr === '97') continue
    const votes = Number.parseInt(cols[idx.QT_VOTOS], 10) || 0
    if (!votes) continue

    const munCode = pad(cols[idx.CD_MUNICIPIO], 5)
    const munName = cols[idx.NM_MUNICIPIO] || munCode
    const munKey = `${uf}|${munCode}`

    let ufRow = byUf.get(uf)
    if (!ufRow) {
      ufRow = { lula: 0, bolsonaro: 0, totalValid: 0 }
      byUf.set(uf, ufRow)
    }
    let munRow = byMun.get(munKey)
    if (!munRow) {
      munRow = {
        uf,
        code: munCode,
        name: munName,
        lula: 0,
        bolsonaro: 0,
        totalValid: 0,
      }
      byMun.set(munKey, munRow)
    }

    ufRow.totalValid += votes
    munRow.totalValid += votes
    national.totalValid += votes
    if (nr === '13') {
      ufRow.lula += votes
      munRow.lula += votes
      national.lula += votes
    } else if (nr === '22') {
      ufRow.bolsonaro += votes
      munRow.bolsonaro += votes
      national.bolsonaro += votes
    }
  }

  const ufs = {}
  for (const [uf, row] of byUf) {
    ufs[uf] = yearResult(row.lula, row.bolsonaro, row.totalValid)
  }
  const municipios = {}
  for (const [key, row] of byMun) {
    municipios[key] = {
      uf: row.uf,
      code: row.code,
      name: row.name,
      ...yearResult(row.lula, row.bolsonaro, row.totalValid),
    }
  }

  const out = {
    national: yearResult(national.lula, national.bolsonaro, national.totalValid),
    ufs,
    municipios,
    builtAt: new Date().toISOString(),
  }
  writeFileSync(BRAZIL_2022_CACHE, JSON.stringify(out))
  console.log(
    `2022 domestic: ${national.totalValid} valid · ${byUf.size} UFs · ${byMun.size} municipalities`,
  )
  return out
}

function load2022Cache() {
  try {
    return JSON.parse(readFileSync(BRAZIL_2022_CACHE, 'utf8'))
  } catch {
    return null
  }
}

function titleCasePt(name) {
  return String(name || '')
    .toLocaleLowerCase('pt-BR')
    .replace(/(^|[\s\-/'])(\S)/g, (_, sep, ch) => `${sep}${ch.toLocaleUpperCase('pt-BR')}`)
}

async function main() {
  const results = JSON.parse(readFileSync(RESULTS_PATH, 'utf8'))

  let y2022 = load2022Cache()
  if (!y2022?.national || !y2022?.ufs || !y2022?.municipios) {
    const work = join(tmpdir(), 'eleicoes-brazil-2022')
    const csvPath = await ensure2022Csv(work)
    y2022 = await build2022Domestic(csvPath)
  } else {
    console.log(`Reusing ${BRAZIL_2022_CACHE}`)
  }

  console.log('Fetching TSE mun config + BR national + 27 UF (2026)…')
  const munCfg = await fetchJson(
    `${HOST}/${AMBIENTE}/${CICLO}/${ELEICAO}/config/mun-e${pad(ELEICAO, 6)}-cm.json`,
  )

  // Note: EA20 `br` national includes ZZ overseas. Domestic Brazil = sum of UFs.
  const ufDocs = await mapPool(UFS, 8, async (uf) => {
    const doc = await fetchJson(ea20Url(uf))
    await sleep(30)
    return { uf, doc }
  })

  const areas = []
  let natLula = 0
  let natBolso = 0
  let natValid = 0
  let natRegistered = 0
  let natAbstentions = 0
  let natBlank = 0
  let natNullVotes = 0
  let natHasElectorate = false
  let natCounted = 0
  let natTotal = 0
  for (const { uf, doc } of ufDocs) {
    const cand = extractCandidates(doc)
    const valid = totalValidOf(doc, cand.lula, cand.bolsonaro)
    const electorate = electorateOf(doc)
    const y2026 = yearResult(
      cand.lula,
      cand.bolsonaro,
      valid,
      electorate?.registered,
      electorate?.abstentions,
      electorate?.blank,
      electorate?.nullVotes,
    )
    const prevRaw = y2022.ufs[uf] || null
    const prev = prevRaw
      ? yearResult(
          prevRaw.lula,
          prevRaw.bolsonaro,
          prevRaw.totalValid,
          prevRaw.registered,
          prevRaw.abstentions,
          prevRaw.blank,
          prevRaw.nullVotes,
        )
      : null
    const meta = UF_META[uf]
    const cov = coverageOf(doc)
    natLula += cand.lula
    natBolso += cand.bolsonaro
    natValid += valid
    if (electorate) {
      natHasElectorate = true
      natRegistered += electorate.registered
      natAbstentions += electorate.abstentions
      natBlank += electorate.blank
      natNullVotes += electorate.nullVotes
    }
    if (cov) {
      natCounted += cov.counted
      natTotal += cov.total
    }
    areas.push({
      code: uf,
      name: uf,
      nameEn: meta.en,
      namePt: meta.pt,
      level: 'area',
      y2026,
      y2022: prev,
      swing: swingOf(prev, y2026),
      coverage: cov,
    })
  }
  areas.sort((a, b) => a.namePt.localeCompare(b.namePt, 'pt'))
  const y2026National = yearResult(
    natLula,
    natBolso,
    natValid,
    natHasElectorate ? natRegistered : null,
    natHasElectorate ? natAbstentions : null,
    natHasElectorate ? natBlank : null,
    natHasElectorate ? natNullVotes : null,
  )
  const brCoverage =
    natTotal > 0 ? { counted: natCounted, total: natTotal } : null

  // Municipality list from config
  const munList = []
  for (const ufAbr of munCfg.abr || []) {
    const uf = String(ufAbr.cd || '').toUpperCase()
    if (!UF_META[uf]) continue
    for (const mu of ufAbr.mu || []) {
      munList.push({
        uf,
        code: pad(mu.cd, 5),
        name: mu.nm || pad(mu.cd, 5),
      })
    }
  }
  console.log(`Fetching 2026 municipality tallies (${munList.length})…`)

  let done = 0
  const mun2026 = await mapPool(munList, 16, async (m) => {
    try {
      const doc = await fetchJson(ea20Url(m.uf, m.code))
      const cand = extractCandidates(doc)
      const valid = totalValidOf(doc, cand.lula, cand.bolsonaro)
      done += 1
      if (done % 250 === 0 || done === munList.length) {
        console.log(`  municipalities ${done}/${munList.length}`)
      }
      const electorate = electorateOf(doc)
      return {
        ...m,
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
      if (done % 250 === 0) console.log(`  municipalities ${done}/${munList.length}`)
      console.warn(`  skip ${m.uf}/${m.code}: ${err.message}`)
      return null
    }
  })

  /** Municipalities → City tab (lazy brazil-cities.json). */
  const cities = []
  for (const m of mun2026) {
    if (!m?.y2026) continue
    const prevKey = `${m.uf}|${m.code}`
    const prevRaw = y2022.municipios[prevKey]
    const prev = prevRaw
      ? yearResult(
          prevRaw.lula,
          prevRaw.bolsonaro,
          prevRaw.totalValid,
          prevRaw.registered,
          prevRaw.abstentions,
          prevRaw.blank,
          prevRaw.nullVotes,
        )
      : null
    const pretty = titleCasePt(m.name)
    cities.push({
      code: `${m.uf}-${m.code}`,
      name: m.name,
      nameEn: pretty,
      namePt: pretty,
      level: 'city',
      area: m.uf,
      areaEn: UF_META[m.uf].en,
      areaPt: UF_META[m.uf].pt,
      y2026: m.y2026,
      y2022: prev,
      swing: swingOf(prev, m.y2026),
      coverage: m.coverage,
    })
  }
  cities.sort((a, b) => {
    const uf = a.area.localeCompare(b.area)
    if (uf !== 0) return uf
    return a.name.localeCompare(b.name, 'pt')
  })

  writeFileSync(
    CITIES_PATH,
    JSON.stringify(
      {
        countryId: 'brazil',
        updatedAt: new Date().toISOString(),
        count: cities.length,
        cities,
      },
      null,
      0,
    ) + '\n',
  )

  // Preserve suburbCount from prior locals build if present.
  let suburbCount = 0
  try {
    const prevBr = results.countries.find((c) => c.id === 'brazil')
    suburbCount = prevBr?.suburbCount ?? 0
  } catch {
    /* ignore */
  }

  const brazil = {
    id: 'brazil',
    countryEn: 'Brazil',
    countryPt: 'Brasil',
    iso3: 'BRA',
    abbrevEn: 'BRA',
    abbrevPt: 'BRA',
    region: 'Brazil',
    domestic: true,
    y2022: y2022.national,
    y2026: y2026National,
    swing: swingOf(y2022.national, y2026National),
    coverage: brCoverage,
    areas,
    cities: [],
    cityCount: cities.length,
    suburbs: [],
    suburbCount,
    notes: `TSE EA20 domestic UFs (${brCoverage ? `${brCoverage.counted}/${brCoverage.total}` : 'n/a'} sections; excludes ZZ overseas)`,
    status: 'reported',
  }

  const without = results.countries.filter((c) => c.id !== 'brazil')
  // Keep Brazil first so it is easy to find when included.
  results.countries = [brazil, ...without]

  // Sources
  const sources = results.meta.sources || []
  const ensureSource = (name, url, role) => {
    if (sources.some((s) => s.name === name)) return
    sources.push({ name, url, role })
  }
  ensureSource('TSE Dados Abertos — 2022 1st round (domestic)', 'https://dadosabertos.tse.jus.br/', {
    en: 'Official 2022 domestic presidential results by state (UF) and municipality (votação por seção, excluding ZZ)',
    pt: 'Resultados oficiais de 2022 no Brasil por UF e município (votação por seção, excluindo ZZ)',
  })
  ensureSource('TSE Resultados 2026 (EA20 BR/UF/município)', 'https://resultados.tse.jus.br/', {
    en: 'Official domestic presidential totalization — national, state, and municipality (1st round)',
    pt: 'Totalização oficial doméstica — Brasil, UF e município (1º turno)',
  })
  results.meta.sources = sources
  results.meta.updatedAt = new Date().toISOString()
  results.meta.tseBr = {
    election: ELEICAO,
    fetchedAt: new Date().toISOString(),
    sectionsCounted: brCoverage?.counted ?? 0,
    sectionsTotal: brCoverage?.total ?? 0,
    sectionsPct: brCoverage
      ? round1((brCoverage.counted / brCoverage.total) * 100)
      : 0,
    lula: y2026National.lula,
    bolsonaro: y2026National.bolsonaro,
    totalValid: y2026National.totalValid,
    url: ea20Url('br'),
    note: 'Domestic sum of UF tallies (BR national EA20 includes ZZ; excluded here)',
  }

  writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2) + '\n')
  console.log(
    `Wrote Brazil: ${y2026National.totalValid} valid 2026 · ${areas.length} areas · ${cities.length} cities (lazy file)`,
  )
  console.log(`  ${CITIES_PATH}`)
  console.log(
    'Within-municipality locals: npm run build:brazil-locals → brazil-suburbs.json',
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
