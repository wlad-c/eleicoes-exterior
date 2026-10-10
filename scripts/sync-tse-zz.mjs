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

/** TSE ZZ municipality code → app country id (shared with the live client). */
const CITY_TO_COUNTRY = JSON.parse(
  readFileSync(join(ROOT, 'src/data/tse-city-map.json'), 'utf8'),
)

/** TSE ZZ municipality code → 2022 YearResult (from votacao_secao open data). */
const CITY_2022 = JSON.parse(
  readFileSync(join(ROOT, 'src/data/tse-city-2022.json'), 'utf8'),
)

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

  /** @type {Map<string, {lula:number,bolsonaro:number,totalValid:number,counted:number,total:number,areas:Array<{code:string,name:string,y2026:ReturnType<typeof yearResult>,coverage:{counted:number,total:number}}>}>} */
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
    const electorate = electorateOf(doc)
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
      registered: 0,
      abstentions: 0,
      blank: 0,
      nullVotes: 0,
      hasElectorate: false,
      areas: [],
    }
    agg.lula += lula
    agg.bolsonaro += bolsonaro
    agg.totalValid += totalValid
    agg.counted += counted
    agg.total += total
    if (electorate) {
      agg.hasElectorate = true
      agg.registered += electorate.registered
      agg.abstentions += electorate.abstentions
      agg.blank += electorate.blank
      agg.nullVotes += electorate.nullVotes
    }
    const y2026 = yearResult(
      lula,
      bolsonaro,
      totalValid,
      electorate?.registered,
      electorate?.abstentions,
      electorate?.blank,
      electorate?.nullVotes,
    )
    const y2022Raw = CITY_2022[code]
    const y2022 = y2022Raw
      ? yearResult(
          y2022Raw.lula,
          y2022Raw.bolsonaro,
          y2022Raw.totalValid,
          y2022Raw.registered,
          y2022Raw.abstentions,
          y2022Raw.blank,
          y2022Raw.nullVotes,
        )
      : null
    agg.areas.push({
      code,
      name: city,
      level: 'area',
      y2026,
      y2022,
      swing: swingOf(y2022, y2026),
      coverage: { counted, total },
    })
    aggregates.set(countryId, agg)

    fetched++
    if (fetched % 20 === 0) {
      console.log(`  …fetched ${fetched} areas`)
      await sleep(50) // stay well under 100 req/s
    }
  }

  for (const agg of aggregates.values()) {
    agg.areas.sort((a, b) => b.y2026.totalValid - a.y2026.totalValid)
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
    const y2026 = yearResult(
      agg.lula,
      agg.bolsonaro,
      agg.totalValid,
      agg.hasElectorate ? agg.registered : null,
      agg.hasElectorate ? agg.abstentions : null,
      agg.hasElectorate ? agg.blank : null,
      agg.hasElectorate ? agg.nullVotes : null,
    )
    country.y2026 = y2026
    country.swing = swingOf(country.y2022, y2026)
    country.status = 'reported'
    country.coverage = { counted: agg.counted, total: agg.total }
    country.areas = agg.areas
    const cityNotes = agg.areas
      .map((c) => `${c.name} ${c.coverage.counted}/${c.coverage.total}`)
      .join('; ')
    const partial = agg.counted < agg.total
    country.notes = partial
      ? `TSE EA20 (${agg.counted}/${agg.total} seções; ${cityNotes})`
      : `TSE EA20 (${cityNotes})`
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
          en: 'Official overseas presidential totalization by country and area (ZZ areas) — primary 2026 source',
          pt: 'Totalização oficial no exterior por país e área (áreas ZZ) — fonte primária de 2026',
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

  // Keep bilingual place labels in sync with place-names.json
  try {
    const { execFileSync } = await import('node:child_process')
    execFileSync(process.execPath, [join(__dirname, 'apply-place-names.mjs')], {
      stdio: 'inherit',
    })
  } catch (e) {
    console.warn('apply-place-names skipped:', e.message)
  }


  console.log(
    JSON.stringify(
      {
        updated,
        newlyReported,
        keptPressWithoutTse: keptPress,
        areasFetched: fetched,
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
