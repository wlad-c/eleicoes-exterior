#!/usr/bin/env node
/**
 * Sync overseas 2026 presidential tallies from official TSE EA20 JSON (UF ZZ).
 *
 * Primary source: https://resultados.tse.jus.br/oficial/ele2026/6257/...
 * Falls back to existing press/BU figures only when TSE has not yet published
 * any sections for that country.
 *
 * Usage: node scripts/sync-tse-zz.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const RESULTS_PATH = join(ROOT, 'src/data/results.json')

const HOST = 'https://resultados.tse.jus.br'
const AMBIENTE = 'oficial'
const CICLO = 'ele2026'
const ELEICAO = '6257'
const CARGO = '1' // Presidente

const UA =
  'eleicoes-exterior/1.0 (+https://github.com/wlad-c/eleicoes-exterior; TSE EA20 sync)'

/** TSE ZZ municipality code → app country id (multi-city countries aggregate). */
const CITY_TO_COUNTRY = {
  // Asia / Oceania
  '30627': 'japan', // Tóquio
  '30198': 'japan', // Nagóia
  '29742': 'japan', // Hamamatsu
  '30562': 'australia', // Sydney
  '29491': 'australia', // Canberra
  '30317': 'china-mainland', // Pequim
  '30848': 'china-mainland', // Xangai
  '30651': 'china-mainland', // Cantão
  '29793': 'hong-kong',
  '30805': 'new-zealand', // Wellington
  '29548': 'singapore',
  '30538': 'south-korea', // Seul
  '29343': 'thailand', // Bangkok
  '29890': 'malaysia', // Kuala Lumpur
  '30082': 'philippines', // Manila
  '30570': 'taiwan', // Taipé
  '29840': 'indonesia', // Jacarta
  '30210': 'india', // Nova Delhi
  '30171': 'india', // Mumbai
  '29750': 'vietnam', // Hanói
  '30597': 'iran', // Teerã
  '29173': 'nepal', // Katmandu
  '99376': 'myanmar', // Yangon (not in app yet — ignored if missing)
  // Europe
  '29955': 'portugal', // Lisboa
  '30341': 'portugal', // Porto
  '30961': 'portugal', // Faro
  '29386': 'germany', // Berlim
  '29696': 'germany', // Frankfurt
  '30180': 'germany', // Munique
  '29971': 'united-kingdom', // Londres
  '99503': 'united-kingdom', // Edimburgo
  '30449': 'italy', // Roma
  '30120': 'italy', // Milão
  '30864': 'switzerland', // Zurique
  '29700': 'switzerland', // Genebra
  '30287': 'france', // Paris
  '99511': 'france', // Marselha
  '30066': 'spain', // Madri
  '29351': 'spain', // Barcelona
  '29661': 'ireland', // Dublin
  '30457': 'netherlands', // Amsterdã
  '29432': 'belgium', // Bruxelas
  '29688': 'sweden', // Estocolmo
  '30767': 'austria', // Viena
  '29599': 'denmark', // Copenhague
  '30244': 'norway', // Oslo
  '29785': 'finland', // Helsinque
  '29459': 'hungary', // Budapeste
  '29335': 'greece', // Atenas
  '30350': 'czech-republic', // Praga
  '30740': 'poland', // Varsóvia
  '99317': 'estonia', // Talin
  '39306': 'turkey', // Istambul
  '39160': 'slovenia', // Liubliana
  '39209': 'slovakia', // Bratislava
  '29440': 'romania', // Bucareste
  '29378': 'serbia', // Belgrado
  '39020': 'croatia', // Zagreb
  '39322': 'cyprus', // Nicosia
  '30546': 'bulgaria', // Sófia
  // Americas
  '39080': 'united-states', // Atlanta
  '29416': 'united-states', // Boston
  '29513': 'united-states', // Chicago
  '29807': 'united-states', // Houston
  '29980': 'united-states', // Los Angeles
  '30112': 'united-states', // Miami
  '30228': 'united-states', // Nova York
  '99490': 'united-states', // Orlando
  '30503': 'united-states', // São Francisco
  '30783': 'united-states', // Washington
  '30902': 'united-states', // Hartford
  '30155': 'canada', // Montreal
  '30252': 'canada', // Ottawa
  '30635': 'canada', // Toronto
  '39063': 'canada', // Vancouver
  '29467': 'argentina', // Buenos Aires
  '29602': 'argentina', // Córdoba
  '39004': 'argentina', // Mendoza
  '99155': 'argentina', // Puerto Iguazú
  '29327': 'paraguay', // Assunção
  '29556': 'paraguay', // Ciudad del Este
  '29670': 'paraguay', // Encarnación
  '30309': 'paraguay', // Pedro Juan Caballero
  '30465': 'paraguay', // Salto del Guairá
  '30295': 'argentina', // Paso Los Libres
  '29319': 'uruguay', // Artigas
  '29521': 'uruguay', // Chuy
  '30147': 'uruguay', // Montevidéu
  '99244': 'uruguay', // Rivera
  '30481': 'chile', // Santiago
  '29904': 'bolivia', // La Paz
  '29572': 'bolivia', // Cochabamba
  '30473': 'bolivia', // Santa Cruz de la Sierra
  '99210': 'bolivia', // Cobija
  '99236': 'bolivia', // Puerto Quijarro
  '30104': 'mexico', // Mexico
  '29475': 'french-guiana', // Caiena
  '99333': 'french-guiana', // St Georges de Loyapock
  '29947': 'peru', // Lima
  '29823': 'peru', // Iquitos
  '29408': 'colombia', // Bogotá
  '30260': 'panama', // Panama
  '30279': 'suriname', // Paramaribo
  '30392': 'ecuador', // Quito
  '30511': 'costa-rica', // São José
  '30490': 'dominican-republic', // São Domingos
  '98000': 'guatemala', // Guatemala
  '30600': 'honduras', // Tegucigalpa
  '30163': 'russia', // Moscou
  '30074': 'nicaragua', // Manágua
  '30520': 'el-salvador', // São Salvador
  '29718': 'guyana', // Georgetown
  '30368': 'cape-verde', // Praia
  '29645': 'timor-leste', // Díli
  '29777': 'cuba', // Havana
  '99180': 'bahamas', // Nassau
  '99430': 'jamaica', // Kingston
  '30333': 'haiti', // Porto Príncipe
  '30325': 'trinidad-and-tobago', // Port of Spain
  // Middle East / Africa
  '29262': 'united-arab-emirates', // Abu Dhabi
  '30414': 'palestine', // Ramallah
  '29637': 'syria', // Damasco
  '30619': 'israel', // Tel Aviv
  '29289': 'jordan', // Amã
  '29653': 'qatar', // Doha
  '30090': 'mozambique', // Maputo
  '29998': 'angola', // Luanda
  '29483': 'egypt', // Cairo
  '30422': 'saudi-arabia', // Riade
  '30406': 'morocco', // Rabat
  '30201': 'kenya', // Nairóbi
  '29882': 'kuwait', // Kuaite
  '39102': 'oman', // Mascate
  '30821': 'namibia', // Windhoek
  '99473': 'bahrain', // Barein
  '99198': 'nigeria', // Abuja
  '29912': 'nigeria', // Lagos
  '29270': 'ghana', // Accra
  '29874': 'dr-congo', // Kinshasa
  '30708': 'tunisia', // Tunis
  '99287': 'zambia', // Lusaca
  '38962': 'tanzania', // Dar es Salaam
  '29530': 'south-africa', // Cidade do Cabo
  '30376': 'south-africa', // Pretória
  '29254': 'ivory-coast', // Abidjã
  '29394': 'guinea-bissau', // Bissau
  '29610': 'senegal', // Dacar
  '29360': 'lebanon', // Beirute
}

function pad(n, w) {
  return String(n).padStart(w, '0')
}

function parseIntPT(v) {
  if (v == null) return 0
  return Number.parseInt(String(v).replace(/\./g, ''), 10) || 0
}

function parsePct(v) {
  if (v == null) return 0
  return Number.parseFloat(String(v).replace(/\./g, '').replace(',', '.')) || 0
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

function ea20Url(municipioCode) {
  const mun = municipioCode ? pad(municipioCode, 5) : ''
  const file = `zz${mun}-c${pad(CARGO, 4)}-e${pad(ELEICAO, 6)}-u.json`
  return `${HOST}/${AMBIENTE}/${CICLO}/${ELEICAO}/dados/zz/${file}`
}

function extractCandidates(doc) {
  const carg = (doc.carg || []).find((c) => String(c.cd) === CARGO) || doc.carg?.[0]
  if (!carg) return { lula: 0, bolsonaro: 0, byNumber: {} }
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
    byNumber,
  }
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

async function main() {
  const results = JSON.parse(readFileSync(RESULTS_PATH, 'utf8'))
  const byId = new Map(results.countries.map((c) => [c.id, c]))

  const munUrl = `${HOST}/${AMBIENTE}/${CICLO}/${ELEICAO}/config/mun-e${pad(ELEICAO, 6)}-cm.json`
  const abUrl = `${HOST}/${AMBIENTE}/${CICLO}/${ELEICAO}/dados/zz/zz-e${pad(ELEICAO, 6)}-ab.json`
  const zzUrl = ea20Url('')

  console.log('Fetching TSE mun config, ZZ acompanhamento, ZZ unificado…')
  const [mun, ab, zzAgg] = await Promise.all([
    fetchJson(munUrl),
    fetchJson(abUrl),
    fetchJson(zzUrl),
  ])

  const zzMun = (mun.abr || []).find((a) => String(a.cd).toLowerCase() === 'zz')
  const names = Object.fromEntries((zzMun?.mu || []).map((m) => [pad(m.cd, 5), m.nm]))

  const progress = new Map()
  for (const row of ab.abr || []) {
    const code = pad(row.cdabr, 5)
    if (code.toLowerCase() === '000zz' || String(row.cdabr).toLowerCase() === 'zz') continue
    const st = parseIntPT(row.s?.st)
    const ts = parseIntPT(row.s?.ts)
    if (st > 0 && ts > 0) progress.set(code, { st, ts, and: row.and, pst: row.s?.pst })
  }

  console.log(`ZZ aggregate: ${zzAgg.s?.st}/${zzAgg.s?.ts} sections (${zzAgg.s?.pst}%)`)
  console.log(`Municipalities with TSE progress: ${progress.size}`)

  /** @type {Map<string, {lula:number,bolsonaro:number,totalValid:number,counted:number,total:number,cities:string[]}>} */
  const aggregates = new Map()

  const codes = [...progress.keys()].sort()
  let fetched = 0
  let skippedUnmapped = 0

  for (const code of codes) {
    const countryId = CITY_TO_COUNTRY[code]
    if (!countryId) {
      skippedUnmapped++
      continue
    }
    if (!byId.has(countryId)) {
      console.warn(`  skip ${code} ${names[code]} — country id ${countryId} not in results.json`)
      skippedUnmapped++
      continue
    }

    let doc
    try {
      doc = await fetchJson(ea20Url(code))
    } catch (e) {
      console.warn(`  fail ${code} ${names[code]}: ${e.message}`)
      await sleep(200)
      continue
    }

    const { lula, bolsonaro } = extractCandidates(doc)
    const totalValid = parseIntPT(doc.v?.vv ?? doc.v?.vvc)
    const counted = parseIntPT(doc.s?.st)
    const total = parseIntPT(doc.s?.ts)
    const city = names[code] || code

    // Acompanhamento can mark a municipality finished before the EA20
    // unificado file has votes; ignore empty payloads.
    if (totalValid <= 0 && counted <= 0) {
      continue
    }

    const agg = aggregates.get(countryId) || {
      lula: 0,
      bolsonaro: 0,
      totalValid: 0,
      counted: 0,
      total: 0,
      cities: [],
    }
    agg.lula += lula
    agg.bolsonaro += bolsonaro
    agg.totalValid += totalValid
    agg.counted += counted
    agg.total += total
    agg.cities.push(`${city} ${counted}/${total}`)
    aggregates.set(countryId, agg)

    fetched++
    if (fetched % 20 === 0) {
      console.log(`  …fetched ${fetched} municipalities`)
      await sleep(50) // stay well under 100 req/s
    }
  }

  let updated = 0
  let newlyReported = 0
  let keptPress = 0

  for (const country of results.countries) {
    const agg = aggregates.get(country.id)
    if (!agg || agg.totalValid <= 0) {
      if (country.status === 'reported' && country.notes && !/^TSE\b/i.test(country.notes)) {
        keptPress++
      }
      continue
    }

    const wasPending = country.status !== 'reported'
    const y2026 = yearResult(agg.lula, agg.bolsonaro, agg.totalValid)
    country.y2026 = y2026
    country.swing = swingOf(country.y2022, y2026)
    country.status = 'reported'
    country.coverage = { counted: agg.counted, total: agg.total }
    const partial = agg.counted < agg.total
    country.notes = partial
      ? `TSE EA20 (${agg.counted}/${agg.total} seções; ${agg.cities.join('; ')})`
      : `TSE EA20 (${agg.cities.join('; ')})`
    updated++
    if (wasPending) newlyReported++
  }

  const zzCand = extractCandidates(zzAgg)
  const zzValid = parseIntPT(zzAgg.v?.vv ?? zzAgg.v?.vvc)

  results.meta.updatedAt = new Date().toISOString()
  results.meta.subtitle = {
    en: '2026 vs 2022 presidential results abroad (official TSE totalization; press BUs only where TSE pending)',
    pt: 'Resultados presidenciais no exterior 2026 vs 2022 (totalização oficial do TSE; BUs da imprensa só onde o TSE ainda não publicou)',
  }

  // Ensure TSE is listed first among 2026 sources and marked primary.
  const sources = results.meta.sources || []
  const tseIdx = sources.findIndex((s) => /TSE Resultados 2026/i.test(s.name))
  const tseSource = {
    name: 'TSE Resultados 2026 (EA20 ZZ)',
    url: 'https://resultados.tse.jus.br/',
    role: {
      en: 'Official overseas presidential totalization by country (ZZ municipalities) — primary 2026 source',
      pt: 'Totalização oficial no exterior por país (municípios ZZ) — fonte primária de 2026',
    },
  }
  if (tseIdx >= 0) sources[tseIdx] = tseSource
  else sources.splice(1, 0, tseSource)

  for (const s of sources) {
    if (/^g1$/i.test(s.name) && s.role) {
      s.role = {
        en: '2026 overseas BU roundups (secondary — used only where TSE has not yet published)',
        pt: 'Levantamentos 2026 de BU no exterior (secundário — só onde o TSE ainda não publicou)',
      }
    }
    if (/^Exame$/i.test(s.name) && s.role) {
      s.role = {
        en: '2026 overseas BU tallies (secondary to TSE)',
        pt: 'Apurações 2026 de BU no exterior (secundário ao TSE)',
      }
    }
    if (/^Poder360$/i.test(s.name) && s.role) {
      s.role = {
        en: '2026 overseas BU tallies (secondary to TSE)',
        pt: 'Apurações 2026 de BU no exterior (secundário ao TSE)',
      }
    }
  }
  results.meta.sources = sources

  // Store ZZ rollup for maintainers (non-breaking extra meta field).
  results.meta.tseZz = {
    election: ELEICAO,
    fetchedAt: results.meta.updatedAt,
    sectionsCounted: parseIntPT(zzAgg.s?.st),
    sectionsTotal: parseIntPT(zzAgg.s?.ts),
    sectionsPct: parsePct(zzAgg.s?.pst),
    lula: zzCand.lula,
    bolsonaro: zzCand.bolsonaro,
    totalValid: zzValid,
    url: zzUrl,
  }

  writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2) + '\n')

  console.log(
    JSON.stringify(
      {
        updated,
        newlyReported,
        keptPressWithoutTse: keptPress,
        municipalitiesFetched: fetched,
        unmappedOrUnknown: skippedUnmapped,
        zz: results.meta.tseZz,
      },
      null,
      2,
    ),
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
