#!/usr/bin/env node
/**
 * Aggregate TSE ballot-box (BU) votes into voting cities for countries with a
 * curated section→city map (see src/data/tse-location-map.json).
 *
 * Example: Australia CAMBERRA município → Camberra / Melbourne / Perth;
 *          SYDNEY município → Sydney / Brisbane.
 *
 * Usage: node scripts/sync-tse-locations.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const RESULTS_PATH = join(ROOT, 'src/data/results.json')
const LOC_MAP_PATH = join(ROOT, 'src/data/tse-location-map.json')
const LOC_2022_PATH = join(ROOT, 'src/data/tse-location-2022.json')

const HOST = 'https://resultados.tse.jus.br'
const PLEITO = '3220'
const UA =
  'eleicoes-exterior/1.0 (+https://github.com/wlad-c/eleicoes-exterior; TSE BU locations)'

const LOC_2022 = JSON.parse(readFileSync(LOC_2022_PATH, 'utf8'))

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

function fold(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
}

const LOC_ALIASES = {
  NAGOIA: 'NAGOYA',
  NAGOYA: 'NAGOIA',
  OIZUMI: 'GUNMA',
  GUNMA: 'OIZUMI',
}

function matchLocKey(byLoc, locName, claimed) {
  if (!byLoc) return null
  if (byLoc[locName] && !claimed.has(fold(locName))) return locName
  const f = fold(locName)
  for (const k of Object.keys(byLoc)) {
    if (fold(k) === f && !claimed.has(fold(k))) return k
  }
  const alias = LOC_ALIASES[f]
  if (alias) {
    for (const k of Object.keys(byLoc)) {
      if ((fold(k) === alias || fold(k) === fold(alias)) && !claimed.has(fold(k))) {
        return k
      }
    }
  }
  return null
}

function attachLoc2022(locations) {
  const claimed = new Map()
  for (const loc of locations) {
    const mun = loc.areaCode || loc.code?.split('-')[0]
    if (!claimed.has(mun)) claimed.set(mun, new Set())
    const key = matchLocKey(LOC_2022[mun], loc.name, claimed.get(mun))
    if (!key) {
      loc.y2022 = null
      loc.swing = null
      continue
    }
    claimed.get(mun).add(fold(key))
    const raw = LOC_2022[mun][key]
    loc.y2022 = yearResult(raw.lula, raw.bolsonaro, raw.totalValid)
    loc.swing = swingOf(loc.y2022, loc.y2026)
  }
  for (const loc of locations) {
    if (loc.y2022) continue
    const mun = loc.areaCode || loc.code?.split('-')[0]
    if (!claimed.has(mun)) claimed.set(mun, new Set())
    const byLoc = LOC_2022[mun] || {}
    const free = Object.keys(byLoc).filter((k) => !claimed.get(mun).has(fold(k)))
    const unmatched = locations.filter((l) => {
      const m = l.areaCode || l.code?.split('-')[0]
      return m === mun && !l.y2022
    })
    if (free.length === 1 && unmatched.length === 1) {
      const key = free[0]
      claimed.get(mun).add(fold(key))
      const raw = byLoc[key]
      loc.y2022 = yearResult(raw.lula, raw.bolsonaro, raw.totalValid)
      loc.swing = swingOf(loc.y2022, loc.y2026)
    }
  }
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.json()
}

async function fetchBytes(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return new Uint8Array(await res.arrayBuffer())
}

function parseBuCandidateVotes(bu) {
  const votes = {}
  let i = 0
  while (i < bu.length - 10) {
    if (bu[i] === 0xa3 && bu[i + 1] === 0x06 && bu[i + 2] === 0x02) {
      const nlen = bu[i + 3]
      let candidate = 0
      for (let k = 0; k < nlen; k++) candidate = (candidate << 8) | bu[i + 4 + k]
      let qtd = null
      for (let j = i - 1; j >= Math.max(0, i - 12); j--) {
        if (bu[j] === 0x82 && j + 1 < i) {
          const qlen = bu[j + 1]
          if (qlen > 0 && qlen <= 4 && j + 2 + qlen <= i) {
            qtd = 0
            for (let k = 0; k < qlen; k++) qtd = (qtd << 8) | bu[j + 2 + k]
            break
          }
        }
      }
      if (qtd != null) votes[String(candidate)] = (votes[String(candidate)] || 0) + qtd
      i += 8
      continue
    }
    i++
  }
  return votes
}

function resolveLocation(section, munCfg) {
  for (const [loc, secs] of Object.entries(munCfg.cities)) {
    if (secs === '*') continue
    if (secs.includes(section)) return loc
  }
  const star = Object.entries(munCfg.cities).find(([, v]) => v === '*')
  return star?.[0] ?? null
}

async function syncCountry(countryId, cfg) {
  const csUrl = `${HOST}/oficial/ele2026/arquivo-urna/${PLEITO}/config/zz/zz-p00${PLEITO}-cs.json`
  const cs = await fetchJson(csUrl)
  const munCodes = new Set(Object.keys(cfg.areas))
  const principals = []
  for (const mu of cs.abr?.[0]?.mu || []) {
    const munCode = pad(mu.cd || '', 5)
    if (!munCodes.has(munCode)) continue
    for (const zon of mu.zon || []) {
      for (const sec of zon.sec || []) {
        if (!sec.ns || sec.nsp || !sec.da) continue
        principals.push({
          munCode,
          munName: mu.nm || cfg.areas[munCode].name,
          zone: pad(zon.cd || '1', 4),
          section: pad(sec.ns, 4),
        })
      }
    }
  }

  const aggregates = new Map()
  for (const [munCode, munCfg] of Object.entries(cfg.areas)) {
    for (const locName of Object.keys(munCfg.cities)) {
      aggregates.set(`${munCode}:${locName}`, {
        name: locName.toUpperCase(),
        area: munCfg.name,
        areaCode: munCode,
        lula: 0,
        bolsonaro: 0,
        totalValid: 0,
        counted: 0,
        total: 0,
      })
    }
  }

  // Coverage totals = principal EA16 sections (aggregated nsp sections excluded).
  for (const p of principals) {
    const munCfg = cfg.areas[p.munCode]
    const locName = resolveLocation(p.section, munCfg)
    if (!locName) continue
    const agg = aggregates.get(`${p.munCode}:${locName}`)
    if (agg) agg.total += 1
  }

  let ok = 0
  for (const p of principals) {
    const munCfg = cfg.areas[p.munCode]
    const locName = resolveLocation(p.section, munCfg)
    if (!locName) continue
    const agg = aggregates.get(`${p.munCode}:${locName}`)
    if (!agg) continue
    const auxUrl =
      `${HOST}/oficial/ele2026/arquivo-urna/${PLEITO}/dados/zz/` +
      `${p.munCode}/${p.zone}/${p.section}/p00${PLEITO}-zz-m${p.munCode}-z${p.zone}-s${p.section}-aux.json`
    try {
      const aux = await fetchJson(auxUrl)
      const hash = aux.hashes?.[0]?.hash
      const buName = aux.hashes?.[0]?.arq?.find((a) => a.tp === 'bu')?.nm
      if (!hash || !buName) continue
      const buUrl =
        `${HOST}/oficial/ele2026/arquivo-urna/${PLEITO}/dados/zz/` +
        `${p.munCode}/${p.zone}/${p.section}/${hash}/${buName}`
      const bu = await fetchBytes(buUrl)
      const votes = parseBuCandidateVotes(bu)
      agg.lula += votes['13'] || 0
      agg.bolsonaro += votes['22'] || 0
      agg.totalValid += Object.values(votes).reduce((a, b) => a + b, 0)
      agg.counted += 1
      ok++
    } catch (e) {
      console.warn(`  fail ${p.munCode}/${p.section}: ${e.message}`)
    }
  }

  const locations = [...aggregates.values()]
    .filter((a) => a.totalValid > 0 || a.counted > 0)
    .map((a) => {
      const y2026 = yearResult(a.lula, a.bolsonaro, a.totalValid)
      return {
        code: `${a.areaCode}-${a.name}`,
        name: a.name,
        level: 'city',
        area: a.area,
        areaCode: a.areaCode,
        y2026,
        y2022: null,
        swing: null,
        coverage: a.total > 0 ? { counted: a.counted, total: a.total } : null,
      }
    })
    .sort((a, b) => b.y2026.totalValid - a.y2026.totalValid)

  attachLoc2022(locations)
  for (const loc of locations) delete loc.areaCode

  return { locations, sectionsOk: ok, principals: principals.length }
}

async function main() {
  const results = JSON.parse(readFileSync(RESULTS_PATH, 'utf8'))
  const locMap = JSON.parse(readFileSync(LOC_MAP_PATH, 'utf8'))
  const summary = {}

  for (const [countryId, cfg] of Object.entries(locMap)) {
    console.log(`Syncing voting cities for ${countryId}…`)
    const { locations, sectionsOk, principals } = await syncCountry(countryId, cfg)
    const country = results.countries.find((c) => c.id === countryId)
    if (!country) {
      console.warn(`  country ${countryId} missing from results.json`)
      continue
    }
    country.cities = locations
    summary[countryId] = {
      cities: locations.length,
      sectionsOk,
      principals,
      sample: locations.map((l) => `${l.name}:${l.y2026.totalValid}`),
    }
    console.log(`  → ${locations.length} cities from ${sectionsOk}/${principals} BUs`)
  }

  results.meta.updatedAt = new Date().toISOString()
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

  console.log(JSON.stringify(summary, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
