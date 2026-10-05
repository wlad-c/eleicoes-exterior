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

const HOST = 'https://resultados.tse.jus.br'
const PLEITO = '3220'
const UA =
  'eleicoes-exterior/1.0 (+https://github.com/wlad-c/eleicoes-exterior; TSE BU locations)'

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
  for (const [loc, secs] of Object.entries(munCfg.locations)) {
    if (secs === '*') continue
    if (secs.includes(section)) return loc
  }
  const star = Object.entries(munCfg.locations).find(([, v]) => v === '*')
  return star?.[0] ?? null
}

async function syncCountry(countryId, cfg) {
  const csUrl = `${HOST}/oficial/ele2026/arquivo-urna/${PLEITO}/config/zz/zz-p00${PLEITO}-cs.json`
  const cs = await fetchJson(csUrl)
  const munCodes = new Set(Object.keys(cfg.municipalities))
  const principals = []
  for (const mu of cs.abr?.[0]?.mu || []) {
    const munCode = pad(mu.cd || '', 5)
    if (!munCodes.has(munCode)) continue
    for (const zon of mu.zon || []) {
      for (const sec of zon.sec || []) {
        if (!sec.ns || sec.nsp || !sec.da) continue
        principals.push({
          munCode,
          munName: mu.nm || cfg.municipalities[munCode].name,
          zone: pad(zon.cd || '1', 4),
          section: pad(sec.ns, 4),
        })
      }
    }
  }

  const aggregates = new Map()
  for (const [munCode, munCfg] of Object.entries(cfg.municipalities)) {
    for (const locName of Object.keys(munCfg.locations)) {
      aggregates.set(`${munCode}:${locName}`, {
        name: locName.toUpperCase(),
        municipality: munCfg.name,
        municipalityCode: munCode,
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
    const munCfg = cfg.municipalities[p.munCode]
    const locName = resolveLocation(p.section, munCfg)
    if (!locName) continue
    const agg = aggregates.get(`${p.munCode}:${locName}`)
    if (agg) agg.total += 1
  }

  let ok = 0
  for (const p of principals) {
    const munCfg = cfg.municipalities[p.munCode]
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
    .map((a) => ({
      code: `${a.municipalityCode}-${a.name}`,
      name: a.name,
      level: 'location',
      municipality: a.municipality,
      y2026: yearResult(a.lula, a.bolsonaro, a.totalValid),
      y2022: null,
      swing: null,
      coverage: a.total > 0 ? { counted: a.counted, total: a.total } : null,
    }))
    .sort((a, b) => b.y2026.totalValid - a.y2026.totalValid)

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
    country.locations = locations
    summary[countryId] = {
      locations: locations.length,
      sectionsOk,
      principals,
      sample: locations.map((l) => `${l.name}:${l.y2026.totalValid}`),
    }
    console.log(`  → ${locations.length} locations from ${sectionsOk}/${principals} BUs`)
  }

  results.meta.updatedAt = new Date().toISOString()
  writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2) + '\n')
  console.log(JSON.stringify(summary, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
