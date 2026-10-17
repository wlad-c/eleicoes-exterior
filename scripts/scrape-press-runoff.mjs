#!/usr/bin/env node
/**
 * Night-of runoff helper: scrape reputable press BU roundups and merge into
 * results-runoff.json for countries still missing TSE totals.
 *
 * Primary outlets (same allowlist spirit as 1º turno):
 *   - g1, Exame, Poder360, Metro1, Brasil de Fato, BNews
 *
 * Design:
 *   1. Fetch configured URLs (override via scripts/data/press-runoff-sources.json)
 *   2. Parse obvious "País … Lula X% … Bolsonaro Y%" patterns (best-effort)
 *   3. Write/merge only where status is still pending OR source==='press'
 *   4. Never overwrite source==='tse' rows
 *
 * This is intentionally conservative — parsers will need tuning on the day
 * when articles publish. Dry-run by default; pass --apply to write.
 *
 * Usage:
 *   node scripts/scrape-press-runoff.mjs
 *   node scripts/scrape-press-runoff.mjs --apply
 *   node scripts/scrape-press-runoff.mjs --url=https://…
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const RESULTS = join(ROOT, 'src/data/results-runoff.json')
const SOURCES_PATH = join(ROOT, 'scripts/data/press-runoff-sources.json')

const UA =
  'eleicoes-exterior/1.0 (+https://github.com/wlad-c/eleicoes-exterior; press BU runoff scrape)'

const DEFAULT_SOURCES = [
  {
    name: 'g1',
    url: 'https://g1.globo.com/mundo/',
    note: 'Replace with the runoff BU roundup URL when published',
  },
  {
    name: 'Poder360',
    url: 'https://www.poder360.com.br/poder-eleicoes-2026/',
    note: 'Replace with the runoff exterior results URL when published',
  },
  {
    name: 'Exame',
    url: 'https://exame.com/',
    note: 'Replace with the runoff overseas BU article when published',
  },
]

function round1(n) {
  return Math.round(n * 100) / 100
}

function yearFromPct(lulaPct, bolsoPct, totalValid = 0) {
  const lula = totalValid
    ? Math.round((lulaPct / 100) * totalValid)
    : 0
  const bolsonaro = totalValid
    ? Math.round((bolsoPct / 100) * totalValid)
    : 0
  return {
    lula,
    bolsonaro,
    totalValid: totalValid || lula + bolsonaro,
    lulaPct: round1(lulaPct),
    bolsonaroPct: round1(bolsoPct),
  }
}

function fold(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Build name → countryId index from the runoff seed. */
function countryIndex(countries) {
  const map = new Map()
  for (const c of countries) {
    if (c.domestic) continue
    for (const n of [c.countryEn, c.countryPt, c.abbrevEn, c.abbrevPt]) {
      map.set(fold(n), c.id)
    }
  }
  // Common press aliases
  const aliases = {
    eua: 'united-states',
    usa: 'united-states',
    'estados unidos': 'united-states',
    'reino unido': 'united-kingdom',
    uk: 'united-kingdom',
    'emirados arabes': 'united-arab-emirates',
    emirates: 'united-arab-emirates',
  }
  for (const [k, id] of Object.entries(aliases)) {
    if (!map.has(k)) map.set(k, id)
  }
  return map
}

/**
 * Best-effort extraction: lines/sentences mentioning a country and two
 * percentages near Lula / Bolsonaro (or 13 / 22).
 */
function extractTallies(html, nameIndex) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')

  const found = new Map()
  // e.g. "Portugal … Lula 64% … Bolsonaro 36%" (order flexible)
  const re =
    /([A-ZÀ-Ü][\wÀ-ü'’\-]*(?:\s+[A-ZÀ-Ü][\wÀ-ü'’\-]*){0,3}).{0,80}?(?:Lula|13).{0,40}?(\d{1,2}(?:[.,]\d)?)\s*%.{0,80}?(?:Bolsonaro|Flávio|Flavio|22).{0,40}?(\d{1,2}(?:[.,]\d)?)\s*%/gi

  let m
  while ((m = re.exec(text))) {
    const name = m[1].trim()
    const id = nameIndex.get(fold(name))
    if (!id) continue
    const lulaPct = Number.parseFloat(m[2].replace(',', '.'))
    const bolsoPct = Number.parseFloat(m[3].replace(',', '.'))
    if (!(lulaPct >= 0 && lulaPct <= 100 && bolsoPct >= 0 && bolsoPct <= 100)) {
      continue
    }
    found.set(id, {
      countryId: id,
      name,
      lulaPct,
      bolsoPct,
      raw: m[0].slice(0, 160),
    })
  }
  return [...found.values()]
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/json' },
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return res.text()
}

function loadSources(extraUrls) {
  let list = DEFAULT_SOURCES
  if (existsSync(SOURCES_PATH)) {
    try {
      list = JSON.parse(readFileSync(SOURCES_PATH, 'utf8'))
    } catch (e) {
      console.warn('Could not parse press-runoff-sources.json:', e.message)
    }
  }
  for (const u of extraUrls) {
    list.push({ name: 'cli', url: u })
  }
  return list
}

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const extraUrls = args
    .filter((a) => a.startsWith('--url='))
    .map((a) => a.slice('--url='.length))

  const data = JSON.parse(readFileSync(RESULTS, 'utf8'))
  const nameIndex = countryIndex(data.countries)
  const sources = loadSources(extraUrls)

  const allHits = []
  for (const src of sources) {
    if (!src.url) continue
    process.stdout.write(`Fetching ${src.name}: ${src.url}\n`)
    try {
      const html = await fetchText(src.url)
      const hits = extractTallies(html, nameIndex)
      console.log(`  → ${hits.length} country tallies matched`)
      for (const h of hits) {
        allHits.push({ ...h, sourceName: src.name, sourceUrl: src.url })
      }
    } catch (e) {
      console.warn(`  ! ${e.message}`)
    }
  }

  // Prefer last hit per country (later sources win)
  const byCountry = new Map()
  for (const h of allHits) byCountry.set(h.countryId, h)

  console.log(`\nUnique countries parsed: ${byCountry.size}`)
  for (const h of byCountry.values()) {
    console.log(
      `  ${h.countryId}: Lula ${h.lulaPct}% / Bolso ${h.bolsoPct}% (${h.sourceName})`,
    )
  }

  if (!apply) {
    console.log('\nDry-run only. Re-run with --apply to merge into results-runoff.json')
    console.log(
      `Tip: put night-of article URLs in ${SOURCES_PATH} once they publish.`,
    )
    return
  }

  let updated = 0
  let skippedTse = 0
  data.countries = data.countries.map((c) => {
    const hit = byCountry.get(c.id)
    if (!hit) return c
    if (c.source === 'tse' && c.status === 'reported') {
      skippedTse++
      return c
    }
    const y2026 = yearFromPct(hit.lulaPct, hit.bolsoPct, c.y2026?.totalValid || 0)
    updated++
    return {
      ...c,
      y2026,
      swing:
        c.y2022 && c.y2022.totalValid > 0
          ? {
              lulaPp: round1(y2026.lulaPct - c.y2022.lulaPct),
              bolsonaroPp: round1(y2026.bolsonaroPct - c.y2022.bolsonaroPct),
              marginPp: round1(
                y2026.lulaPct -
                  c.y2022.lulaPct -
                  (y2026.bolsonaroPct - c.y2022.bolsonaroPct),
              ),
            }
          : null,
      status: 'reported',
      source: 'press',
      notes: `Press BU (${hit.sourceName}) — ${hit.sourceUrl}`,
      coverage: c.coverage,
    }
  })

  data.meta.updatedAt = new Date().toISOString()
  writeFileSync(RESULTS, JSON.stringify(data) + '\n')
  console.log(`\nWrote ${RESULTS} (updated ${updated}, skipped TSE ${skippedTse})`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
