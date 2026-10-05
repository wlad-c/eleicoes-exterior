#!/usr/bin/env node
/**
 * Attach 2022 YearResult + swing onto existing city/location rows in results.json
 * using tse-city-2022.json / tse-location-2022.json (no live TSE fetch).
 *
 * Usage: node scripts/apply-city-2022.mjs
 */
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const RESULTS = join(ROOT, 'src/data/results.json')
const DOCS = join(ROOT, 'docs/data/results.json')
const CITY_2022 = JSON.parse(
  readFileSync(join(ROOT, 'src/data/tse-city-2022.json'), 'utf8'),
)
const LOC_2022 = JSON.parse(
  readFileSync(join(ROOT, 'src/data/tse-location-2022.json'), 'utf8'),
)

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

/** Spelling drift between 2022 TSE labels and 2026 NM_LOCAL_VOTACAO. */
const LOC_ALIASES = {
  NAGOIA: 'NAGOYA',
  NAGOYA: 'NAGOIA',
  OIZUMI: 'GUNMA',
  GUNMA: 'OIZUMI',
}

function matchLocKey(byLoc, locName, claimed) {
  if (!byLoc) return null
  const tryKey = (k) => {
    if (!k || !byLoc[k] || claimed.has(fold(k))) return null
    return k
  }
  if (tryKey(locName)) return locName
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

function munCodeFromCity(city) {
  if (city.level === 'city' && city.code?.includes('-')) {
    return city.code.split('-')[0]
  }
  return city.code
}

const results = JSON.parse(readFileSync(RESULTS, 'utf8'))
let citiesFilled = 0
let locsFilled = 0
let citiesMissing = 0
let locsMissing = 0

for (const country of results.countries) {
  for (const city of country.areas || []) {
    const raw = CITY_2022[city.code]
    if (raw) {
      city.y2022 = yearResult(raw.lula, raw.bolsonaro, raw.totalValid)
      city.swing = swingOf(city.y2022, city.y2026)
      citiesFilled++
    } else {
      city.y2022 = null
      city.swing = null
      citiesMissing++
    }
  }

  const locRows = country.cities || []
  const claimed = new Map()
  // Pass 1: exact / folded / alias
  for (const loc of locRows) {
    loc.y2022 = null
    loc.swing = null
    const mun = munCodeFromCity(loc)
    if (!claimed.has(mun)) claimed.set(mun, new Set())
    const key = matchLocKey(LOC_2022[mun], loc.name, claimed.get(mun))
    if (!key) continue
    claimed.get(mun).add(fold(key))
    const raw = LOC_2022[mun][key]
    loc.y2022 = yearResult(raw.lula, raw.bolsonaro, raw.totalValid)
    loc.swing = swingOf(loc.y2022, loc.y2026)
    locsFilled++
  }
  // Pass 2: if one 2026 loc and one 2022 local remain in a mun, pair them
  for (const loc of locRows) {
    if (loc.y2022) continue
    const mun = munCodeFromCity(loc)
    if (!claimed.has(mun)) claimed.set(mun, new Set())
    const byLoc = LOC_2022[mun] || {}
    const free = Object.keys(byLoc).filter((k) => !claimed.get(mun).has(fold(k)))
    const unmatched = locRows.filter(
      (l) => munCodeFromCity(l) === mun && !l.y2022,
    )
    if (free.length === 1 && unmatched.length === 1) {
      const key = free[0]
      claimed.get(mun).add(fold(key))
      const raw = byLoc[key]
      loc.y2022 = yearResult(raw.lula, raw.bolsonaro, raw.totalValid)
      loc.swing = swingOf(loc.y2022, loc.y2026)
      locsFilled++
    } else {
      locsMissing++
    }
  }
}

const src2022 = results.meta.sources?.find((s) => /2022/i.test(s.name))
if (src2022) {
  src2022.role = {
    en: 'Official 2022 overseas presidential results by country, TSE area, and voting city (votação por seção, UF ZZ)',
    pt: 'Resultados oficiais de 2022 no exterior por país, área TSE e cidade de votação (votação por seção, UF ZZ)',
  }
}

results.meta.updatedAt = new Date().toISOString()
writeFileSync(RESULTS, JSON.stringify(results, null, 2) + '\n')
try {
  copyFileSync(RESULTS, DOCS)
} catch {
  /* docs may be rebuilt later */
}

console.log(
  JSON.stringify(
    { citiesFilled, citiesMissing, locsFilled, locsMissing },
    null,
    2,
  ),
)
