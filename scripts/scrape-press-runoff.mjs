#!/usr/bin/env node
/**
 * Night-of runoff helper: scrape reputable press BU roundups and merge into
 * results-runoff.json for countries still missing TSE totals.
 *
 * Always checks major Brazilian outlets:
 *   g1, UOL, CNN Brasil, Poder360, Exame, Brasil de Fato, BNews,
 *   Metro1, O Globo, Folha, Estadão (+ CBN when listed)
 *
 * Design:
 *   1. Fetch configured article + hub URLs (scripts/data/press-runoff-sources.json)
 *   2. Discover same-host exterior / BU / 2º-turno article links from hubs
 *      (HTML href + markdown links from the reader fallback)
 *   3. Parse absolute-vote patterns (g1, Poder360 bullets, CNN bullets,
 *      Exame prose, UOL/BNews/BdF narrative)
 *   4. Fall back to curl + r.jina.ai when an outlet returns 403 / Access Denied
 *   5. Write/merge only where status is still pending OR source==='press'
 *   6. Never overwrite source==='tse' rows
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

/** Major Brazilian news hosts — always scrape when listed in sources. */
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
  'noticias.uol.com.br',
  'www.uol.com.br',
  'uol.com.br',
  'www.cnnbrasil.com.br',
  'cnnbrasil.com.br',
  'oglobo.globo.com',
  'www.folha.uol.com.br',
  'folha.uol.com.br',
  'www1.folha.uol.com.br',
  'www.estadao.com.br',
  'estadao.com.br',
  'cbn.globo.com',
])

const JINA_PROXY = 'https://r.jina.ai/'

const DEFAULT_SOURCES = [
  {
    name: 'g1',
    url: 'https://g1.globo.com/mundo/',
    hub: 'https://g1.globo.com/mundo/',
    discover: true,
  },
  {
    name: 'UOL',
    url: 'https://noticias.uol.com.br/internacional/ultimas-noticias/2026/10/25/votacao-exterior-segundo-turno-lula-e-flavio.ghtm',
    hub: 'https://noticias.uol.com.br/eleicoes/',
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
  if (/pesquisa|datafolha|poderdata|agora|gerp|ipec|quaest/.test(h) && !/exterior|boletim|urna/.test(h)) {
    return false
  }
  if (/votacao-no-exterior|votos-no-exterior|eleicao-exterior|eleicoes-exterior|votacao-exterior/.test(h)) {
    return true
  }
  if (/boletim/.test(h) && /urna/.test(h)) return true
  if (/boletins-urna|exterior-boletins/.test(h)) return true
  if (/exterior/.test(h) && /voto|eleic|resultado|boletim|urna|apurac|flavio|lula/.test(h)) {
    return true
  }
  // Poder360 / Exame / CNN runoff exterior landing pages
  if (
    /2-turno-exterior|2o-turno-exterior|exterior-resultados|exterior\/segundo|sai-na-frente-no-japao|lula-na-oceania/.test(
      h,
    )
  ) {
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
    taiwan: 'taiwan',
    formosa: 'taiwan',
    'hong kong': 'hong-kong',
    hongkong: 'hong-kong',
    cingapura: 'singapore',
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

/** Prefer the richer absolute tally when quality ties (e.g. g1 China > partial UOL). */
function preferHit(prev, next) {
  if (!prev) return next
  const pq = hitQuality(prev)
  const nq = hitQuality(next)
  if (nq > pq) return next
  if (nq < pq) return prev
  // %-anchored absolute (source stated matching %) beats a larger vote-only
  // guess when the implied Lula share diverges (Exame live-blog Estonia
  // 160+Greece 311 → 33.97% vs real 82.9%).
  if (pq >= 2 && nq >= 2) {
    const shareGap = Math.abs((prev.lulaPct ?? 0) - (next.lulaPct ?? 0))
    if (shareGap > 5) {
      if (prev.pctAnchored && !next.pctAnchored) return prev
      if (next.pctAnchored && !prev.pctAnchored) return next
    }
  }
  const pt = prev.totalValid || 0
  const nt = next.totalValid || 0
  // Require a meaningful gap so near-ties (UOL NZ 121 vs g1 101) keep the first hit.
  if (nt > pt * 1.05) return next
  if (nt < pt * 0.95) return prev
  return prev
}

/** Drop absolute tallies whose stated % disagrees with the vote share (±3pp). */
function pctMatchesVotes(votes, total, pct, tol = 3) {
  if (pct == null || !(total > 0) || !(votes >= 0)) return true
  const actual = (votes / total) * 100
  return Math.abs(actual - pct) <= tol
}

function makeHit(countryId, name, lula, bolsonaro, lulaPct, bolsoPct, raw) {
  if (!(lula >= 0 && bolsonaro >= 0) || lula + bolsonaro <= 0) return null
  const totalValid = lula + bolsonaro
  const lp = lulaPct ?? round1((lula / totalValid) * 100)
  const bp = bolsoPct ?? round1((bolsonaro / totalValid) * 100)
  if (!pctMatchesVotes(lula, totalValid, lulaPct) || !pctMatchesVotes(bolsonaro, totalValid, bolsoPct)) {
    return null
  }
  return {
    countryId,
    name,
    lula,
    bolsonaro,
    totalValid,
    lulaPct: lp,
    bolsoPct: bp,
    // True when the source stated at least one % that matched the vote share.
    pctAnchored: lulaPct != null || bolsoPct != null,
    raw: String(raw || '').slice(0, 180),
  }
}

/** Narrative matches must stay inside one country clause (no "Na Finlândia…" bleed). */
function crossesCountryClause(raw) {
  const s = String(raw || '')
  const rest = s.replace(/^(?:Na|No|Em)\s+[A-ZÀ-Ü][\wÀ-ü'’\-]*(?:\s+[A-ZÀ-Ü][\wÀ-ü'’\-]*){0,4}/u, '')
  return /\b(?:Na|No|Em|Já\s+na)\s+[A-ZÀ-Ü]/u.test(rest)
}

/**
 * Extract country tallies. Supports:
 *  - g1: "Nova Zelândia 2º turno: Lula, 418 votos (80,54%) … Flávio, 101 votos"
 *  - Poder360 bullets: "COREIA DO SUL Lula (PT) – 148 votos (64,35%); Flávio – 82 votos"
 *  - CNN bullets: "Austrália (64,5%) com 6.017 votos contra 3.465 de Flávio"
 *  - Exame / list: "Lula: 418 votos" near a country, or "recebeu 418 votos, contra 101"
 *  - UOL / BNews / BdF narrative sentences
 *  - %-only fallback when both shares are present
 */
function extractTallies(html, nameIndex) {
  // Strip markdown emphasis so **Lula** / ## headings parse cleanly (jina reader).
  const text = htmlToText(html)
    .replace(/\*{1,3}/g, ' ')
    .replace(/_{1,2}/g, ' ')
    .replace(/#{1,6}\s*/g, ' ')
    .replace(/\bpublicidade\b/gi, ' ')
  const found = new Map()

  const take = (hit) => {
    if (!hit) return
    found.set(hit.countryId, preferHit(found.get(hit.countryId), hit))
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
    const lulaPct =
      aWho === 'lula' ? aPct : bPct
    const bolsoPct =
      aWho === 'bolso' ? aPct : bPct
    take(makeHit(id, name, lula, bolsonaro, lulaPct, bolsoPct, m[0]))
  }

  // Poder360 / heading + bullets (votes first, then %):
  //   "COREIA DO SUL Lula (PT) – 148 votos válidos (64,35%); Flávio (PL) – 82 votos (35,65%)."
  const p360Re =
    /([A-ZÀ-Ü][\wÀ-ü'’\-]*(?:\s+[A-ZÀ-Ü][\wÀ-ü'’\-]*){0,4})\s+Lula(?:\s*\(\s*PT\s*\))?\s*[–—:\-]\s*([\d.]+)\s+votos?(?:\s+válidos)?\s*\(\s*([\d.,]+)\s*%\s*\)\s*;?\s*(?:Flávio|Flavio)(?:\s+Bolsonaro)?(?:\s*\(\s*PL\s*\))?\s*[–—:\-]\s*([\d.]+)\s+votos?(?:\s+válidos)?\s*\(\s*([\d.,]+)\s*%\s*\)/gi
  while ((m = p360Re.exec(text))) {
    const name = m[1].trim()
    const id = resolveCountry(name, nameIndex)
    if (!id) continue
    take(makeHit(id, name, parseNum(m[2]), parseNum(m[4]), parseNum(m[3]), parseNum(m[5]), m[0]))
  }

  // Flávio-first Poder360 blocks (Filipinas / Malásia)
  const p360BolsoFirstRe =
    /([A-ZÀ-Ü][\wÀ-ü'’\-]*(?:\s+[A-ZÀ-Ü][\wÀ-ü'’\-]*){0,4})\s+(?:Flávio|Flavio)(?:\s+Bolsonaro)?(?:\s*\(\s*PL\s*\))?\s*[–—:\-]\s*([\d.]+)\s+votos?(?:\s+válidos)?\s*\(\s*([\d.,]+)\s*%\s*\)\s*;?\s*Lula(?:\s*\(\s*PT\s*\))?\s*[–—:\-]\s*([\d.]+)\s+votos?(?:\s+válidos)?\s*\(\s*([\d.,]+)\s*%\s*\)/gi
  while ((m = p360BolsoFirstRe.exec(text))) {
    const name = m[1].trim()
    const id = resolveCountry(name, nameIndex)
    if (!id) continue
    take(makeHit(id, name, parseNum(m[4]), parseNum(m[2]), parseNum(m[5]), parseNum(m[3]), m[0]))
  }

  // Legacy Poder360: pct then votes in parentheses
  const p360LegacyRe =
    /([A-ZÀ-Ü][\wÀ-ü'’\-]*(?:\s+[A-ZÀ-Ü][\wÀ-ü'’\-]*){0,4})\s+Lula(?:\s*\(\s*PT\s*\))?.{0,40}?([\d.,]+)\s*%\s*\(?\s*([\d.]+)\s*vot[^)]{0,20}\)?.{0,80}?(?:Flávio|Flavio|Bolsonaro).{0,40}?([\d.,]+)\s*%\s*\(?\s*([\d.]+)\s*vot/gi
  while ((m = p360LegacyRe.exec(text))) {
    const name = m[1].trim()
    const id = resolveCountry(name, nameIndex)
    if (!id) continue
    take(makeHit(id, name, parseNum(m[3]), parseNum(m[5]), parseNum(m[2]), parseNum(m[4]), m[0]))
  }

  // CNN-style country bullets (winner's votes first):
  //   "Japão (80,08%), com 28.538 votos contra 7.098 de Lula (19,92%)"
  //   "Austrália (64,5%) com 6.017 votos contra 3.465 de Flávio (36,5%)"
  const cnnRe =
    /([A-ZÀ-Ü][\wÀ-ü'’\-]*(?:\s+[A-ZÀ-Ü][\wÀ-ü'’\-]*){0,3})\s*\((\d{1,2}(?:[.,]\d{1,2})?)\s*%\)\s*,?\s*com\s+([\d.]+)\s+votos?\s+contra\s+([\d.]+)\s+de\s+(Lula|(?:Flávio|Flavio)(?:\s+Bolsonaro)?)\s*(?:\((\d{1,2}(?:[.,]\d{1,2})?)\s*%\))?/gi
  while ((m = cnnRe.exec(text))) {
    const name = m[1].trim()
    const id = resolveCountry(name, nameIndex)
    if (!id) continue
    const winnerPct = parseNum(m[2])
    const winnerVotes = parseNum(m[3])
    const loserVotes = parseNum(m[4])
    const loserIsLula = /lula/i.test(m[5])
    const loserPct = m[6] ? parseNum(m[6]) : null
    const lula = loserIsLula ? loserVotes : winnerVotes
    const bolsonaro = loserIsLula ? winnerVotes : loserVotes
    const lulaPct = loserIsLula ? loserPct : winnerPct
    const bolsoPct = loserIsLula ? winnerPct : loserPct
    take(makeHit(id, name, lula, bolsonaro, lulaPct, bolsoPct, m[0]))
  }

  // Exame / prose: "O petista recebeu 418 votos, contra 101 do candidato" near country name.
  // Keep the window tight so "…Egito… Jordânia… Lula recebeu 725 contra 76" cannot
  // attribute Jordan's tally to Egypt (or any earlier country in the same paragraph).
  const exameProseRe =
    /([A-ZÀ-Ü][\wÀ-ü'’\-]*(?:[ \t]+[\wÀ-ü'’\-]+){0,4})[ \t,;:]*?(?:petista|Lula)(?:\s*\([^)]*\))?\s+recebeu\s+([\d.]+)\s+votos?\s*,?\s*contra\s+([\d.]+)/gi
  while ((m = exameProseRe.exec(text))) {
    const name = m[1].trim()
    if (name.length > 40 || /turno|resultado|país/i.test(name)) continue
    const id = resolveCountry(name, nameIndex)
    if (!id) continue
    if (/1[ºo]\s*turno|primeiro\s+turno|2022/i.test(m[0])) continue
    take(makeHit(id, name, parseNum(m[2]), parseNum(m[3]), null, null, m[0]))
  }

  // Exame RESUMO: "Lula recebeu 6.017 votos (63,46%) na Austrália … contra 3.465"
  // Stay inside one sentence ([^.]) so "…contra 76 do PL. No Egito… contra 16"
  // cannot steal Jordan's 725 for Egypt.
  const exameResumoRe =
    /Lula\s+recebeu\s+([\d.]+)\s+votos?[^.]{0,50}?(?:na|no|em)\s+([A-ZÀ-Ü][\wÀ-ü'’\-]*(?:[ \t]+[\wÀ-ü'’\-]+){0,4})[^.]{0,80}?contra\s+([\d.]+)/gi
  while ((m = exameResumoRe.exec(text))) {
    const name = m[2].trim()
    const id = resolveCountry(name, nameIndex)
    if (!id) continue
    if (/1[ºo]\s*turno|primeiro\s+turno|2022/i.test(m[0])) continue
    take(makeHit(id, name, parseNum(m[1]), parseNum(m[3]), null, null, m[0]))
  }


  // O Globo / Exame list bullets under a country heading:
  //   "Austrália" then "Lula: 6.017" / "Flávio Bolsonaro: 3.465"
  //   "Nova Zelândia" then "Lula: 418 votos (80,54%)" / "Flávio: 101 votos"
  const listBulletRe =
    /(?:^|[\n\r\*#]|\s{2,})([A-ZÀ-Ü][\wÀ-ü'’\-]*(?:\s+[A-ZÀ-Ü][\wÀ-ü'’\-]*){0,3})\s+(Lula|(?:Flávio|Flavio)(?:\s+Bolsonaro)?)\s*:\s*([\d.]+)(?:\s+votos?)?(?:\s*\(\s*([\d.,]+)\s*%[^)]*\))?\s+(Lula|(?:Flávio|Flavio)(?:\s+Bolsonaro)?)\s*:\s*([\d.]+)(?:\s+votos?)?(?:\s*\(\s*([\d.,]+)\s*%[^)]*\))?/gi
  while ((m = listBulletRe.exec(text))) {
    const name = m[1].trim()
    const id = resolveCountry(name, nameIndex)
    if (!id) continue
    const who = (w) => (/lula/i.test(w) ? 'lula' : 'bolso')
    const aWho = who(m[2])
    const bWho = who(m[5])
    if (aWho === bWho) continue
    const aVotes = parseNum(m[3])
    const bVotes = parseNum(m[6])
    const aPct = m[4] ? parseNum(m[4]) : null
    const bPct = m[7] ? parseNum(m[7]) : null
    const lula = aWho === 'lula' ? aVotes : bVotes
    const bolsonaro = aWho === 'bolso' ? aVotes : bVotes
    const lulaPct = aWho === 'lula' ? aPct : bPct
    const bolsoPct = aWho === 'bolso' ? aPct : bPct
    take(makeHit(id, name, lula, bolsonaro, lulaPct, bolsoPct, m[0]))
  }

  // Exame live roundup: "Austrália: No 2º turno, Lula recebeu 6.017 votos (63,46%). Flávio … somou 3.465 (36,54%)."
  // Require "No 2º turno," so "No 1º turno: Lula recebeu …" never starts a match.
  // No /i (otherwise [A-Z…] matches lowercase). htmlToText flattens newlines — anchor on
  // non-word before the country, not line start. Allow "Coreia do Sul" connectors.
  const exameLiveRe =
    /(?:^|[^\wÀ-ü])([A-ZÀ-Ü][\wÀ-ü'’\-]*(?:[ \t]+[\wÀ-ü'’\-]+){0,4})[ \t]*:[ \t]*No[ \t]+2[ºo][ \t]*turno,[ \t]*(Lula|(?:Flávio|Flavio)(?:[ \t]+Bolsonaro)?)[ \t]+(?:recebeu|somou)[ \t]+([\d.]+)[ \t]+votos?[ \t]*\([ \t]*([\d.,]+)[ \t]*%[ \t]*\)(?:(?!No[ \t]+1[ºo][ \t]*turno)[\s\S]){0,280}?(Lula|(?:Flávio|Flavio)(?:[ \t]+Bolsonaro)?)[ \t]+(?:recebeu|somou)[ \t]+([\d.]+)[ \t]*(?:\([ \t]*([\d.,]+)[ \t]*%[ \t]*\)|votos?)/g
  while ((m = exameLiveRe.exec(text))) {
    // Prefer the rightmost resolvable suffix ("Resultado país a país Austrália" → Austrália).
    const rawName = m[1].trim()
    if (/turno/i.test(rawName)) continue
    const parts = rawName.split(/\s+/)
    let name = rawName
    let id = null
    for (let i = parts.length - 1; i >= 0 && !id; i--) {
      for (let len = 1; len <= 4 && i - len + 1 >= 0; len++) {
        const candidate = parts.slice(i - len + 1, i + 1).join(' ')
        if (!/^[A-ZÀ-Ü]/u.test(candidate)) continue
        const cid = resolveCountry(candidate, nameIndex)
        if (cid) {
          name = candidate
          id = cid
          break
        }
      }
    }
    if (!id) continue
    const who = (w) => (/lula/i.test(w) ? 'lula' : 'bolso')
    const aWho = who(m[2])
    const bWho = who(m[5])
    if (aWho === bWho) continue
    const aVotes = parseNum(m[3])
    const bVotes = parseNum(m[6])
    const aPct = parseNum(m[4])
    const bPct = m[7] ? parseNum(m[7]) : null
    const lula = aWho === 'lula' ? aVotes : bVotes
    const bolsonaro = aWho === 'bolso' ? aVotes : bVotes
    take(
      makeHit(
        id,
        name,
        lula,
        bolsonaro,
        aWho === 'lula' ? aPct : bPct,
        aWho === 'bolso' ? aPct : bPct,
        m[0],
      ),
    )
  }

  // Exame bullets without "No 2º turno," prefix (newer Middle East / Africa rows):
  //   "Síria: Lula recebeu 106 votos (90,60%). Flávio Bolsonaro somou 11 (9,40%)."
  //   "Arábia Saudita: Lula recebeu 49 votos (61,25%). Flávio Bolsonaro somou 31 (38,75%)."
  // Stop before "No 1º turno" / "No 2º turno"; no /i so country names don't span prose.
  const exameBulletRe =
    /(?:^|[^\wÀ-ü])([A-ZÀ-Ü][\wÀ-ü'’\-]*(?:[ \t]+[\wÀ-ü'’\-]+){0,4})[ \t]*:[ \t]*(Lula|(?:Flávio|Flavio)(?:[ \t]+Bolsonaro)?)[ \t]+(?:recebeu|somou)[ \t]+([\d.]+)[ \t]+votos?[ \t]*\([ \t]*([\d.,]+)[ \t]*%[ \t]*\)(?:(?!No[ \t]+[12][ºo][ \t]*turno)[\s\S]){0,200}?(Lula|(?:Flávio|Flavio)(?:[ \t]+Bolsonaro)?)[ \t]+(?:recebeu|somou)[ \t]+([\d.]+)[ \t]*(?:\([ \t]*([\d.,]+)[ \t]*%[ \t]*\)|votos?)/g
  while ((m = exameBulletRe.exec(text))) {
    const rawName = m[1].trim()
    if (/turno/i.test(rawName)) continue
    const parts = rawName.split(/\s+/)
    let name = rawName
    let id = null
    for (let i = parts.length - 1; i >= 0 && !id; i--) {
      for (let len = 1; len <= 4 && i - len + 1 >= 0; len++) {
        const candidate = parts.slice(i - len + 1, i + 1).join(' ')
        if (!/^[A-ZÀ-Ü]/u.test(candidate)) continue
        const cid = resolveCountry(candidate, nameIndex)
        if (cid) {
          name = candidate
          id = cid
          break
        }
      }
    }
    if (!id) continue
    const who = (w) => (/lula/i.test(w) ? 'lula' : 'bolso')
    const aWho = who(m[2])
    const bWho = who(m[5])
    if (aWho === bWho) continue
    const aVotes = parseNum(m[3])
    const bVotes = parseNum(m[6])
    const aPct = parseNum(m[4])
    const bPct = m[7] ? parseNum(m[7]) : null
    const lula = aWho === 'lula' ? aVotes : bVotes
    const bolsonaro = aWho === 'bolso' ? aVotes : bVotes
    take(
      makeHit(
        id,
        name,
        lula,
        bolsonaro,
        aWho === 'lula' ? aPct : bPct,
        aWho === 'bolso' ? aPct : bPct,
        m[0],
      ),
    )
  }

  // UOL / BNews / BdF narrative (number before or after Flávio; optional trailing "votos"):
  //   "Na Austrália, Lula conseguiu 5.290 votos, comparados com 2.934 de Flávio Bolsonaro"
  //   "Na China, Lula teve 375 votos e Flávio teve 134 votos."
  //   "… Lula recebeu 375 votos, em comparação com 268 no primeiro turno, e Flávio Bolsonaro, 134"
  //   "Na Nova Zelândia, Lula passou de 234 para 418 votos, enquanto Flávio … de 64 para 101"
  //   "Na Coreia do Sul, Lula venceu com 148 votos … Flávio Bolsonaro recebeu 82 votos"
  const uolRe =
    /(?:Na|No|Em)\s+([A-ZÀ-Ü][\wÀ-ü'’\-]*(?:\s+[A-ZÀ-Ü][\wÀ-ü'’\-]*){0,4}),?\s+(?:(?:o\s+petista|Lula)(?:\s*\([^)]*\))?\s+(?:conseguiu|teve|recebeu|obteve|somou|venceu\s+com|passou\s+de\s+[\d.]+\s+para|avan[cç]ou\s+de\s+[\d.]+\s+para)\s+([\d.]+)\s+votos?)\s*[,.]?\s*(?:(?:comparados?|em\s+compara[cç][aã]o)\s+com\s+([\d.]+)\s+de\s+(?:Flávio|Flavio|Bolsonaro)|(?:e\s+)?(?:Flávio|Flavio|Bolsonaro)(?:\s+Bolsonaro)?(?:\s*\([^)]*\))?(?:\s+(?:teve|recebeu|obteve|somou))?\s*,?\s*([\d.]+)(?:\s+votos?)?|(?:enquanto|,)\s*(?:Flávio|Flavio|Bolsonaro|o\s+senador).{0,50}?(?:para|foi\s+de\s+[\d.]+\s+para|subiu\s+de\s+[\d.]+\s+para)\s+([\d.]+)|[\s\S]{0,140}?(?:Flávio|Flavio)(?:\s+Bolsonaro)?\s+(?:teve|recebeu|somou)\s+([\d.]+)\s+votos?)/gi
  while ((m = uolRe.exec(text))) {
    const name = m[1].trim()
    const id = resolveCountry(name, nameIndex)
    if (!id) continue
    // Skip pure 1º-turno / 2022 sentences, but allow "em comparação com N no primeiro turno, e Flávio, M"
    if (/ainda\s+n[aã]o|2022/i.test(m[0])) continue
    if (/1[ºo]\s*turno|primeiro\s+turno/i.test(m[0]) && !/e\s+(?:Flávio|Flavio)/i.test(m[0])) continue
    // Reject "Na Estônia… Já na Grécia, Flávio recebeu 311" cross-country bleeds.
    if (crossesCountryClause(m[0])) continue
    const lula = parseNum(m[2])
    const bolsonaro = parseNum(m[3] || m[4] || m[5] || m[6])
    take(makeHit(id, name, lula, bolsonaro, null, null, m[0]))
  }

  // BdF / long-form China: "… China Continental … Lula recebeu 375 votos, em comparação com 268 no primeiro turno, e Flávio Bolsonaro, 134"
  const bdfChinaRe =
    /(China(?:\s+Continental)?).{0,500}?Lula\s+recebeu\s+([\d.]+)\s+votos?,\s*em\s+compara[cç][aã]o\s+com\s+[\d.]+\s+no\s+primeiro\s+turno,\s*e\s+(?:Flávio|Flavio)(?:\s+Bolsonaro)?,\s*([\d.]+)/gi
  while ((m = bdfChinaRe.exec(text))) {
    const name = m[1].trim()
    const id = resolveCountry(name, nameIndex)
    if (!id) continue
    take(makeHit(id, name, parseNum(m[2]), parseNum(m[3]), null, null, m[0]))
  }

  // Flávio-first narrative variant
  const uolBolsoFirstRe =
    /(?:Na|No|Em)\s+([A-ZÀ-Ü][\wÀ-ü'’\-]*(?:\s+[A-ZÀ-Ü][\wÀ-ü'’\-]*){0,4}),?\s+(?:Flávio|Flavio)(?:\s+Bolsonaro)?(?:\s*\([^)]*\))?\s+(?:conseguiu|teve|recebeu|obteve|somou|passou\s+de\s+[\d.]+\s+para)\s+([\d.]+)\s+votos?\s*[,.]?\s*(?:(?:comparados?|em\s+compara[cç][aã]o)\s+com\s+([\d.]+)\s+de\s+Lula|(?:e\s+)?Lula(?:\s*\([^)]*\))?(?:\s+(?:teve|recebeu|obteve|somou))?\s*,?\s*([\d.]+)(?:\s+votos?)?|(?:enquanto|,)\s*Lula.{0,40}?para\s+([\d.]+))/gi
  while ((m = uolBolsoFirstRe.exec(text))) {
    const name = m[1].trim()
    const id = resolveCountry(name, nameIndex)
    if (!id) continue
    if (/ainda\s+n[aã]o|2022/i.test(m[0])) continue
    if (/1[ºo]\s*turno|primeiro\s+turno/i.test(m[0]) && !/e\s+Lula/i.test(m[0])) continue
    if (crossesCountryClause(m[0])) continue
    const bolsonaro = parseNum(m[2])
    const lula = parseNum(m[3] || m[4] || m[5])
    take(makeHit(id, name, lula, bolsonaro, null, null, m[0]))
  }

  // BNews / "recebeu N … Flávio … teve M" without requiring "Na X," immediately before Lula
  const bnewsRe =
    /(?:Na|No|Em)\s+([A-ZÀ-Ü][\wÀ-ü'’\-]*(?:\s+[A-ZÀ-Ü][\wÀ-ü'’\-]*){0,4}),?\s+Lula(?:\s*\([^)]*\))?\s+recebeu\s+([\d.]+)\s+votos?.{0,120}?(?:Flávio|Flavio)(?:\s+Bolsonaro)?\s+(?:teve|recebeu|somou)\s+([\d.]+)\s+votos?/gi
  while ((m = bnewsRe.exec(text))) {
    const name = m[1].trim()
    const id = resolveCountry(name, nameIndex)
    if (!id) continue
    if (crossesCountryClause(m[0])) continue
    take(makeHit(id, name, parseNum(m[2]), parseNum(m[3]), null, null, m[0]))
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
  // HTML href=… and markdown [text](url) from r.jina.ai reader output
  const hrefs = [
    ...[...html.matchAll(/href=["']([^"']+)["']/gi)].map((x) => x[1]),
    ...[...html.matchAll(/\[[^\]]*]\((https?:\/\/[^)\s]+)\)/gi)].map((x) => x[1]),
    ...[...html.matchAll(/(https?:\/\/[^\s"'<>]+)/gi)].map((x) => x[1]),
  ]
  const out = []
  const seen = new Set()
  for (const raw of hrefs) {
    let abs
    try {
      // Markdown / prose often leaves trailing ) ] . ; or doubled slashes
      let cleaned = String(raw).trim().replace(/[)\],.;!"']+$/g, '')
      // Collapse duplicate slashes in the path only (keep https://)
      cleaned = cleaned.replace(/^(https?:\/\/)(.*)$/i, (_, scheme, rest) => scheme + rest.replace(/\/{2,}/g, '/'))
      abs = new URL(cleaned, base).href.split('#')[0]
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

async function fetchDirect(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    },
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  const text = await res.text()
  if (/access\s+denied/i.test(text) && text.length < 2000) {
    throw new Error(`Access Denied ${url}`)
  }
  return text
}

/** Shell out to curl — node undici is often 403'd by jina/CDN while curl succeeds. */
async function fetchViaCurl(url) {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const execFileAsync = promisify(execFile)
  // Keep UA minimal — full Chrome UA is 403'd by r.jina.ai from this host.
  const { stdout } = await execFileAsync(
    'curl',
    ['-sL', '-A', 'Mozilla/5.0', '-H', 'Accept: text/plain,*/*', '--max-time', '45', url],
    { maxBuffer: 12 * 1024 * 1024, encoding: 'utf8' },
  )
  if (!stdout || stdout.length < 200) throw new Error(`curl empty/blocked ${url} (${stdout?.length || 0}b)`)
  if (/access\s+denied|doctype html/i.test(stdout) && stdout.length < 2000) {
    throw new Error(`curl Access Denied ${url}`)
  }
  return stdout
}

/** Direct fetch, then r.jina.ai via curl for bot-blocked outlets (UOL, etc.). */
async function fetchText(url) {
  try {
    return await fetchDirect(url)
  } catch (e) {
    const msg = String(e.message || e)
    if (!/HTTP 403|Access Denied|HTTP 401|HTTP 429/i.test(msg)) throw e
    const proxyUrl = `${JINA_PROXY}${url}`
    process.stdout.write(`  → retry via curl+jina\n`)
    try {
      return await fetchViaCurl(proxyUrl)
    } catch (curlErr) {
      throw new Error(`${msg}; ${curlErr.message || curlErr}`)
    }
  }
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

  // Drop same-source duplicate absolute tallies. g1 sometimes pastes one
  // country's 2º turno line onto the next (e.g. Estonia getting Finland's 550/185).
  const pairCountries = new Map()
  for (const h of allHits) {
    if (!(h.totalValid > 0)) continue
    const k = `${h.sourceUrl}\t${h.lula}\t${h.bolsonaro}`
    if (!pairCountries.has(k)) pairCountries.set(k, new Set())
    pairCountries.get(k).add(h.countryId)
  }
  const poisoned = new Set()
  for (const [k, ids] of pairCountries) {
    if (ids.size < 2) continue
    const url = k.split('\t')[0]
    for (const id of ids) poisoned.add(`${url}\t${id}`)
    console.warn(
      `  ! dropping duplicate absolute tally from same source for: ${[...ids].join(', ')}`,
    )
  }

  // Prefer higher-quality / richer absolute tallies across outlets.
  const byCountry = new Map()
  for (const h of allHits) {
    if (poisoned.has(`${h.sourceUrl}\t${h.countryId}`) && h.totalValid > 0) continue
    byCountry.set(h.countryId, preferHit(byCountry.get(h.countryId), h))
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

  // Machine-readable seed delta so timer ticks cannot miss NEW/REV countries.
  const byId = new Map(data.countries.map((c) => [c.id, c]))
  const deltaNew = []
  const deltaRev = []
  for (const hit of byCountry.values()) {
    if (hitQuality(hit) < 2 || !(hit.totalValid > 0)) continue
    const c = byId.get(hit.countryId)
    if (!c) continue
    if (c.source === 'tse' && c.status === 'reported') continue
    const y = c.y2026
    if (!(c.status === 'reported' && y?.totalValid > 0)) {
      deltaNew.push(hit)
      continue
    }
    if (y.lula !== hit.lula || y.bolsonaro !== hit.bolsonaro) {
      deltaRev.push({ hit, prev: y })
    }
  }
  const fmtHit = (h) => `${h.countryId} ${h.lula}/${h.bolsonaro} (${h.sourceName})`
  console.log(
    `\nDELTA_NEW: ${deltaNew.length ? deltaNew.map(fmtHit).join(' | ') : '(none)'}`,
  )
  console.log(
    `DELTA_REV: ${
      deltaRev.length
        ? deltaRev
            .map(
              ({ hit, prev }) =>
                `${hit.countryId} ${prev.lula}/${prev.bolsonaro}→${hit.lula}/${hit.bolsonaro} (${hit.sourceName})`,
            )
            .join(' | ')
        : '(none)'
    }`,
  )
  console.log(
    `DELTA_COUNT: new=${deltaNew.length} rev=${deltaRev.length} absolute=${
      [...byCountry.values()].filter((h) => hitQuality(h) >= 2 && h.totalValid > 0).length
    }`,
  )

  if (!apply) {
    console.log('\nDry-run only. Re-run with --apply to merge into results-runoff.json')
    console.log(`Sources file: ${SOURCES_PATH}`)
    if (deltaNew.length || deltaRev.length) process.exitCode = 2
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
    // Never seed/update from %-only scrapes — need absolute BU vote totals.
    if (hitQuality(hit) < 2 || !(hit.totalValid > 0)) {
      skippedWeak++
      return c
    }
    // Don't clobber a good absolute press row with a meaningfully smaller
    // absolute tally (partial BU refresh). Near-ties (±5%) may still update so
    // consensus corrections (e.g. NZ 101 vs 121) land. Primary outlets
    // (g1 / CNN / Exame / Poder360) may revise downward when they correct.
    if (c.source === 'press' && c.status === 'reported' && c.y2026?.totalValid > 0) {
      const primary =
        /^(g1|CNN Brasil|Exame|Poder360|UOL)$/i.test(String(hit.sourceName || ''))
      if ((hit.totalValid || 0) < c.y2026.totalValid * 0.95 && !primary) {
        skippedWeak++
        return c
      }
      // Refuse vote-only outliers that flip the Lula share vs an existing row.
      const prevShare = c.y2026.lulaPct
      const nextShare = hit.lulaPct
      if (
        !hit.pctAnchored &&
        prevShare != null &&
        nextShare != null &&
        Math.abs(prevShare - nextShare) > 5
      ) {
        skippedWeak++
        return c
      }
    }
    const y2026 = yearFromHit(hit)
    if (!(y2026.totalValid > 0)) {
      return c
    }
    // Large diaspora booths sometimes publish a handful of early BUs first
    // (e.g. Portugal 790 vs ~36k válidos in 2022). Flag those so the UI does
    // not read as a finished country total.
    const prior = c.y2022?.totalValid || 0
    const clearlyPartial = prior >= 3000 && y2026.totalValid < prior * 0.2
    const noteBase = `Press BU (${hit.sourceName}): Lula ${y2026.lula} / Flávio ${y2026.bolsonaro}.`
    const notes = clearlyPartial
      ? `${noteBase} PARCIAL / early BUs only (${y2026.totalValid} válidos vs ${prior} in 2022) — more sections still outstanding. Awaiting fuller press/TSE.`
      : `${noteBase} Awaiting TSE.`
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
      notes,
      coverage: c.coverage,
    }
  })

  data.meta.updatedAt = new Date().toISOString()
  // Upsert press outlet links used for any applied hit (keep g1 + UOL both credited).
  if (Array.isArray(data.meta.sources)) {
    const used = new Map()
    for (const h of byCountry.values()) {
      if (!h.sourceUrl || !h.sourceName) continue
      const key = fold(h.sourceName).split(' ')[0]
      if (!used.has(key)) used.set(key, h)
    }
    for (const hit of used.values()) {
      const nameRe = new RegExp(hit.sourceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      const idx = data.meta.sources.findIndex((s) => nameRe.test(s.name || ''))
      const entry = {
        name: `${hit.sourceName} overseas BU — 2º turno 2026`,
        url: hit.sourceUrl,
        role: {
          en: '2026 runoff overseas BU roundup (secondary — used only where TSE has not yet published)',
          pt: 'Levantamento de BU do 2º turno 2026 no exterior (secundário — só onde o TSE ainda não publicou)',
        },
      }
      if (idx >= 0) data.meta.sources[idx] = { ...data.meta.sources[idx], url: hit.sourceUrl }
      else data.meta.sources.push(entry)
    }
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
