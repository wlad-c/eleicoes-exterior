#!/usr/bin/env node
/**
 * Night-of runoff helper: scrape reputable press BU roundups and merge into
 * results-runoff.json for countries still missing TSE totals.
 *
 * Always checks the 1º-turno allowlist outlets:
 *   g1, Exame, Poder360, Metro1, Brasil de Fato, BNews
 *
 * Design:
 *   1. Fetch configured article + hub URLs (scripts/data/press-runoff-sources.json)
 *   2. Discover same-host exterior / BU / 2º-turno article links from hubs
 *   3. Parse absolute-vote and percentage patterns (g1 + Poder360 styles)
 *   4. Write/merge only where status is still pending OR source==='press'
 *   5. Never overwrite source==='tse' rows
 *
 * Dry-run by default; pass --apply to write src + docs seeds.
 *
 * Usage:
 *   node scripts/scrape-press-runoff.mjs
 *   node scripts/scrape-press-runoff.mjs --apply
 *   node scripts/scrape-press-runoff.mjs --url=https://…
 *   node scripts/scrape-press-runoff.mjs --no-discover
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const RESULTS = join(ROOT, 'src/data/results-runoff.json')
const DOCS_RESULTS = join(ROOT, 'docs/data/results-runoff.json')
const SOURCES_PATH = join(ROOT, 'scripts/data/press-runoff-sources.json')

const UA =
  'Mozilla/5.0 (compatible; eleicoes-exterior/1.0; +https://github.com/wlad-c/eleicoes-exterior) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/** Same outlets credited on the 1º turno seed — always scrape these. */
const ALLOWLIST_HOSTS = new Set([
  'g1.globo.com',
  'www.poder360.com.br',
  'poder360.com.br',
  'exame.com',
  'www.exame.com',
  'www.metro1.com.br',
  'metro1.com.br',
  'www.brasildefato.com.br',
  'brasildefato.com.br',
  'www.bnews.com.br',
  'bnews.com.br',
])

const DEFAULT_SOURCES = [
  {
    name: 'g1',
    url: 'https://g1.globo.com/mundo/',
    hub: 'https://g1.globo.com/mundo/',
    discover: true,
  },
  {
    name: 'Poder360',
    url: 'https://www.poder360.com.br/poder-eleicoes-2026/',
    hub: 'https://www.poder360.com.br/poder-eleicoes-2026/',
    discover: true,
  },
  {
    name: 'Exame',
    url: 'https://exame.com/',
    hub: 'https://exame.com/',
    discover: true,
  },
  {
    name: 'Metro1',
    url: 'https://www.metro1.com.br/',
    hub: 'https://www.metro1.com.br/',
    discover: true,
  },
  {
    name: 'Brasil de Fato',
    url: 'https://www.brasildefato.com.br/',
    hub: 'https://www.brasildefato.com.br/categoria/politica/',
    discover: true,
  },
  {
    name: 'BNews',
    url: 'https://www.bnews.com.br/',
    hub: 'https://www.bnews.com.br/noticias/politica/',
    discover: true,
  },
]

const MAX_DISCOVERED_PER_HUB = 12

/** Same-host links that look like overseas BU / exterior results — not generic 2º-turno polls. */
function isDiscoverableHref(href) {
  const h = href.toLowerCase()
  if (/investir-no-exterior|canais-especiais\/investir/.test(h)) return false
  if (/votacao-no-exterior|votos-no-exterior|eleicao-exterior|eleicoes-exterior/.test(h)) {
    return true
  }
  if (/boletim/.test(h) && /urna/.test(h)) return true
  if (/exterior/.test(h) && /voto|eleic|resultado|boletim|urna|apurac/.test(h)) {
    return true
  }
  // Poder360 / Exame runoff exterior landing pages
  if (/2-turno-exterior|2o-turno-exterior|exterior-resultados|exterior\/segundo/.test(h)) {
    return true
  }
  return false
}

function round1(n) {
  return Math.round(n * 100) / 100
}

function parseNum(raw) {
  const s = String(raw).trim()
  if (!s) return NaN
  // Brazilian thousands: 4.562 / 47.306 → integers; decimals: 80,54 → 80.54
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    return Number.parseInt(s.replace(/\./g, ''), 10)
  }
  if (s.includes(',') && s.includes('.')) {
    return Number.parseFloat(s.replace(/\./g, '').replace(',', '.'))
  }
  if (s.includes(',')) return Number.parseFloat(s.replace(',', '.'))
  return Number.parseFloat(s)
}

function fold(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function hostOf(url) {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

function isAllowlistedUrl(url) {
  return ALLOWLIST_HOSTS.has(hostOf(url))
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
  const aliases = {
    eua: 'united-states',
    usa: 'united-states',
    'estados unidos': 'united-states',
    'reino unido': 'united-kingdom',
    uk: 'united-kingdom',
    'emirados arabes': 'united-arab-emirates',
    'emirados arabes unidos': 'united-arab-emirates',
    emirates: 'united-arab-emirates',
    'coreia do sul': 'south-korea',
    'corea do sul': 'south-korea',
    'hong kong': 'hong-kong',
    'nova zelandia': 'new-zealand',
    china: 'china-mainland',
    'china continental': 'china-mainland',
    'china mainland': 'china-mainland',
    japao: 'japan',
    filipinas: 'philippines',
    malaysia: 'malaysia',
    malasia: 'malaysia',
    singapura: 'singapore',
  }
  for (const [k, id] of Object.entries(aliases)) {
    if (!map.has(k)) map.set(k, id)
  }
  return map
}

/** Decode HTML entities + common JSON unicode escapes in scraped pages. */
function htmlToText(html) {
  let s = String(html || '')
  // JSON-escaped article bodies (Poder360 embeds content this way)
  s = s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) =>
    String.fromCharCode(Number.parseInt(h, 16)),
  )
  s = s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"')
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ')
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ')
  s = s.replace(/<[^>]+>/g, ' ')
  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#8211;/g, '–')
    .replace(/&#\d+;/g, ' ')
  return s.replace(/\s+/g, ' ')
}

function resolveCountry(name, nameIndex) {
  const key = fold(name)
  if (nameIndex.has(key)) return nameIndex.get(key)
  // Try dropping leading "NOVA "/trailing qualifiers
  for (const [k, id] of nameIndex) {
    if (key.includes(k) && k.length >= 4) return id
  }
  return null
}

function hitQuality(hit) {
  // Prefer absolute vote totals over %-only guesses.
  if (hit.lula > 0 || hit.bolsonaro > 0) return 2
  if (hit.lulaPct != null && hit.bolsoPct != null) return 1
  return 0
}

/**
 * Extract country tallies. Supports:
 *  - g1: "Nova Zelândia 2º turno: Lula, 418 votos (80,54%) … Flávio, 101 votos"
 *  - Poder360: "NOVA ZELÂNDIA Lula (PT) – 80,54% (418 votos válidos); Flávio …"
 *  - %-only fallback when both shares are present
 */
function extractTallies(html, nameIndex) {
  const text = htmlToText(html)
  const found = new Map()

  const take = (hit) => {
    const prev = found.get(hit.countryId)
    if (!prev || hitQuality(hit) >= hitQuality(prev)) found.set(hit.countryId, hit)
  }

  // g1-style absolute votes under "2º turno" — either candidate may be listed first
  // (Japan/Malaysia lead with Flávio; NZ/China lead with Lula). Percent optional.
  const cand =
    '(Lula|(?:Flávio|Flavio)(?:\\s+Bolsonaro)?|Bolsonaro)'
  const voteBit = `${cand}[,:]?\\s*([\\d.]+)\\s*votos?(?:\\s*\\(([\\d.,]+)\\s*%\\))?`
  const g1Re = new RegExp(
    `([A-ZÀ-Ü][\\wÀ-ü'’\\-]*(?:\\s+[A-ZÀ-Ü][\\wÀ-ü'’\\-]*){0,4})\\s+2[ºo]\\s*turno\\s*:?\\s*${voteBit}\\s*2[ºo]\\s*turno\\s*:?\\s*${voteBit}`,
    'gi',
  )
  let m
  while ((m = g1Re.exec(text))) {
    const name = m[1].trim()
    const id = resolveCountry(name, nameIndex)
    if (!id) continue
    // Reject "ainda não há dados" blocks (and 1º-turno bleed-through).
    if (/ainda\s+n[aã]o/i.test(m[0])) continue
    if (/1[ºo]\s*turno/i.test(m[0])) continue
    const who = (w) => (/lula/i.test(w) ? 'lula' : 'bolso')
    const aWho = who(m[2])
    const bWho = who(m[5])
    if (aWho === bWho) continue
    const aVotes = parseNum(m[3])
    const bVotes = parseNum(m[6])
    if (!(aVotes >= 0 && bVotes >= 0) || aVotes + bVotes <= 0) continue
    const lula = aWho === 'lula' ? aVotes : bVotes
    const bolsonaro = aWho === 'bolso' ? aVotes : bVotes
    const aPct = m[4] ? parseNum(m[4]) : null
    const bPct = m[7] ? parseNum(m[7]) : null
    const totalValid = lula + bolsonaro
    const lulaPct =
      aWho === 'lula'
        ? (aPct ?? round1((lula / totalValid) * 100))
        : (bPct ?? round1((lula / totalValid) * 100))
    const bolsoPct =
      aWho === 'bolso'
        ? (aPct ?? round1((bolsonaro / totalValid) * 100))
        : (bPct ?? round1((bolsonaro / totalValid) * 100))
    take({
      countryId: id,
      name,
      lula,
      bolsonaro,
      totalValid,
      lulaPct,
      bolsoPct,
      raw: m[0].slice(0, 180),
    })
  }

  // Poder360 / heading style: COUNTRY … Lula … 80,54% (418 votos); Flávio … 19,46% (101)
  const p360Re =
    /([A-ZÀ-Ü][\wÀ-ü'’\-]*(?:\s+[A-ZÀ-Ü][\wÀ-ü'’\-]*){0,4})\s+(?:Lula|\(\s*PT\s*\)).{0,40}?([\d.,]+)\s*%\s*\(?\s*([\d.]+)\s*vot[^)]{0,20}\)?.{0,80}?(?:Flávio|Flavio|Bolsonaro).{0,40}?([\d.,]+)\s*%\s*\(?\s*([\d.]+)\s*vot/gi
  while ((m = p360Re.exec(text))) {
    const name = m[1].trim()
    const id = resolveCountry(name, nameIndex)
    if (!id) continue
    const lulaPct = parseNum(m[2])
    const lula = parseNum(m[3])
    const bolsoPct = parseNum(m[4])
    const bolsonaro = parseNum(m[5])
    if (!(lula >= 0 && bolsonaro >= 0) || lula + bolsonaro <= 0) continue
    take({
      countryId: id,
      name,
      lula,
      bolsonaro,
      totalValid: lula + bolsonaro,
      lulaPct,
      bolsoPct,
      raw: m[0].slice(0, 180),
    })
  }

  // %-only fallback (no absolute votes) — last resort
  const pctRe =
    /([A-ZÀ-Ü][\wÀ-ü'’\-]*(?:\s+[A-ZÀ-Ü][\wÀ-ü'’\-]*){0,3}).{0,80}?(?:Lula|13).{0,40}?(\d{1,2}(?:[.,]\d{1,2})?)\s*%.{0,80}?(?:Bolsonaro|Flávio|Flavio|22).{0,40}?(\d{1,2}(?:[.,]\d{1,2})?)\s*%/gi
  while ((m = pctRe.exec(text))) {
    const name = m[1].trim()
    const id = resolveCountry(name, nameIndex)
    if (!id) continue
    if (/ainda\s+n[aã]o|1[ºo]\s*turno|2022/i.test(m[0])) continue
    const lulaPct = parseNum(m[2])
    const bolsoPct = parseNum(m[3])
    if (!(lulaPct >= 0 && lulaPct <= 100 && bolsoPct >= 0 && bolsoPct <= 100)) {
      continue
    }
    // Skip weak %-only if we already have absolute votes for this country.
    if (found.has(id) && hitQuality(found.get(id)) >= 2) continue
    take({
      countryId: id,
      name,
      lula: 0,
      bolsonaro: 0,
      totalValid: 0,
      lulaPct,
      bolsoPct,
      raw: m[0].slice(0, 180),
    })
  }

  return [...found.values()]
}

function sameRegistrableHost(a, b) {
  return a.replace(/^www\./, '') === b.replace(/^www\./, '')
}

function discoverArticleUrls(hubUrl, html, limit = MAX_DISCOVERED_PER_HUB) {
  const base = new URL(hubUrl)
  const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((x) => x[1])
  const out = []
  const seen = new Set()
  for (const raw of hrefs) {
    let abs
    try {
      abs = new URL(raw, base).href
    } catch {
      continue
    }
    if (!isAllowlistedUrl(abs)) continue
    if (!sameRegistrableHost(hostOf(abs), base.hostname)) continue
    if (!isDiscoverableHref(abs)) continue
    const path = new URL(abs).pathname
    if (path.length < 12) continue
    if (seen.has(abs)) continue
    seen.add(abs)
    out.push(abs)
    if (out.length >= limit) break
  }
  return out
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    },
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

function yearFromHit(hit) {
  if (hit.totalValid > 0 && (hit.lula > 0 || hit.bolsonaro > 0)) {
    const totalValid = hit.lula + hit.bolsonaro
    return {
      lula: hit.lula,
      bolsonaro: hit.bolsonaro,
      totalValid,
      lulaPct: round1(hit.lulaPct ?? (hit.lula / totalValid) * 100),
      bolsonaroPct: round1(hit.bolsoPct ?? (hit.bolsonaro / totalValid) * 100),
    }
  }
  // %-only — keep zeros for absolute votes (UI still shows shares)
  return {
    lula: 0,
    bolsonaro: 0,
    totalValid: 0,
    lulaPct: round1(hit.lulaPct),
    bolsonaroPct: round1(hit.bolsoPct),
  }
}

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const noDiscover = args.includes('--no-discover')
  const extraUrls = args
    .filter((a) => a.startsWith('--url='))
    .map((a) => a.slice('--url='.length))

  const data = JSON.parse(readFileSync(RESULTS, 'utf8'))
  const nameIndex = countryIndex(data.countries)
  const sources = loadSources(extraUrls)

  /** @type {{url: string, name: string, kind: string}[]} */
  const queue = []
  const byUrl = new Map()
  const enqueue = (url, name, kind) => {
    if (!url) return
    if (!isAllowlistedUrl(url) && name !== 'cli') {
      console.warn(`  ! skip non-allowlisted URL: ${url}`)
      return
    }
    const prev = byUrl.get(url)
    if (prev) {
      // Prefer hub so discovery still runs when article URL == hub URL.
      if (kind === 'hub' && prev.kind !== 'hub') prev.kind = 'hub'
      return
    }
    const item = { url, name, kind }
    byUrl.set(url, item)
    queue.push(item)
  }

  for (const src of sources) {
    // Hubs first so discovery expands the queue before later articles.
    if (src.hub) enqueue(src.hub, src.name || 'source', 'hub')
    if (src.url) enqueue(src.url, src.name || 'source', 'article')
    // Sources with discover:true but no explicit hub still discover from url.
    if (src.discover && src.url && !src.hub) {
      enqueue(src.url, src.name || 'source', 'hub')
    }
  }

  const allHits = []
  // Grow the queue while discovering from hubs (single pass expansion).
  for (let i = 0; i < queue.length; i++) {
    const { url, name, kind } = queue[i]
    process.stdout.write(`Fetching ${name} (${kind}): ${url}\n`)
    let html
    try {
      html = await fetchText(url)
    } catch (e) {
      console.warn(`  ! ${e.message}`)
      continue
    }

    if (!noDiscover && kind === 'hub') {
      const found = discoverArticleUrls(url, html)
      console.log(`  → discovered ${found.length} candidate article(s)`)
      for (const u of found) enqueue(u, name, 'discovered')
    }

    const hits = extractTallies(html, nameIndex)
    console.log(`  → ${hits.length} country tallies matched`)
    for (const h of hits) {
      allHits.push({ ...h, sourceName: name, sourceUrl: url })
      console.log(
        `     ${h.countryId}: Lula ${h.lula || '—'} / Flávio ${h.bolsonaro || '—'} (${h.lulaPct}% / ${h.bolsoPct}%)`,
      )
    }
  }

  // Prefer higher-quality hits; later equal-quality sources win.
  const byCountry = new Map()
  for (const h of allHits) {
    const prev = byCountry.get(h.countryId)
    if (!prev || hitQuality(h) >= hitQuality(prev)) byCountry.set(h.countryId, h)
  }

  console.log(`\nUnique countries parsed: ${byCountry.size}`)
  for (const h of byCountry.values()) {
    console.log(
      `  ${h.countryId}: Lula ${h.lula} (${h.lulaPct}%) / Flávio ${h.bolsonaro} (${h.bolsoPct}%) ← ${h.sourceName}`,
    )
  }

  // Always surface Australia status for night-of checks.
  const au = data.countries.find((c) => c.id === 'australia')
  const auHit = byCountry.get('australia')
  console.log(
    `\nAustralia: ${
      auHit
        ? `FOUND Lula ${auHit.lula} / Flávio ${auHit.bolsonaro} (${auHit.sourceName})`
        : `no press tally yet (seed status=${au?.status ?? '?'})`
    }`,
  )

  if (!apply) {
    console.log('\nDry-run only. Re-run with --apply to merge into results-runoff.json')
    console.log(`Sources file: ${SOURCES_PATH}`)
    return
  }

  let updated = 0
  let skippedTse = 0
  let skippedWeak = 0
  data.countries = data.countries.map((c) => {
    const hit = byCountry.get(c.id)
    if (!hit) return c
    if (c.source === 'tse' && c.status === 'reported') {
      skippedTse++
      return c
    }
    // Don't clobber a good absolute press row with %-only scrapes.
    if (
      c.source === 'press' &&
      c.status === 'reported' &&
      c.y2026?.totalValid > 0 &&
      hitQuality(hit) < 2
    ) {
      skippedWeak++
      return c
    }
    const y2026 = yearFromHit(hit)
    if (y2026.totalValid <= 0 && !(y2026.lulaPct > 0 || y2026.bolsonaroPct > 0)) {
      return c
    }
    updated++
    return {
      ...c,
      y2026,
      swing:
        c.y2022 && c.y2022.totalValid > 0 && y2026.totalValid > 0
          ? {
              lulaPp: round1(y2026.lulaPct - c.y2022.lulaPct),
              bolsonaroPp: round1(y2026.bolsonaroPct - c.y2022.bolsonaroPct),
              marginPp: round1(
                y2026.lulaPct -
                  c.y2022.lulaPct -
                  (y2026.bolsonaroPct - c.y2022.bolsonaroPct),
              ),
            }
          : c.swing ?? null,
      status: 'reported',
      source: 'press',
      notes: `Press BU (${hit.sourceName}): Lula ${y2026.lula} / Flávio ${y2026.bolsonaro}. Awaiting TSE.`,
      coverage: c.coverage,
    }
  })

  data.meta.updatedAt = new Date().toISOString()
  // Keep meta source link for the best NZ/g1-style roundup when present.
  const preferUrl =
    byCountry.get('new-zealand')?.sourceUrl ||
    sources.find((s) => /g1/i.test(s.name || ''))?.url
  if (Array.isArray(data.meta.sources) && preferUrl) {
    data.meta.sources = data.meta.sources.map((s) => {
      if (/g1|press|poder360|exame|metro1|bnews|fato/i.test(s.name || '')) {
        return { ...s, url: preferUrl }
      }
      return s
    })
  }

  const payload = JSON.stringify(data) + '\n'
  writeFileSync(RESULTS, payload)
  mkdirSync(dirname(DOCS_RESULTS), { recursive: true })
  writeFileSync(DOCS_RESULTS, payload)
  console.log(
    `\nWrote ${RESULTS} and ${DOCS_RESULTS} (updated ${updated}, skipped TSE ${skippedTse}, skipped weak ${skippedWeak})`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
