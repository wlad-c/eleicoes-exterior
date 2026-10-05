#!/usr/bin/env node
/**
 * Build src/data/tse-location-map.json from official TSE open data:
 * - perfil_eleitor_secao (NM_LOCAL_VOTACAO per section)
 * - correspondência esperada / EA16 principals (sections that actually vote)
 *
 * Only municipalities with 2+ distinct voting locals are included.
 *
 * Usage: node scripts/build-location-map.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT = join(ROOT, 'src/data/tse-location-map.json')
const CITY_TO_COUNTRY = JSON.parse(
  readFileSync(join(ROOT, 'src/data/tse-city-map.json'), 'utf8'),
)

const PLEITO = '3220'
const HOST = 'https://resultados.tse.jus.br'
const CDN = 'https://cdn.tse.jus.br'
const UA = 'eleicoes-exterior/1.0 (+location-map builder)'

function pad(n, w) {
  return String(n).padStart(w, '0')
}

/** Turn TSE local labels into short place names. */
function cleanLocalName(raw) {
  let s = String(raw || '')
    .normalize('NFKC')
    .trim()
  if (!s) return null
  // "CALIFÓRNIA (CONSULADO EM LOS ANGELES)" → "LOS ANGELES"
  const cons = s.match(/CONSULADO EM\s+([^)]+)\)/i)
  if (cons) return cons[1].trim().replace(/\s+/g, ' ')
  // "CALIFÓRNIA (PARTE DE LOS ANGELES)" → "LOS ANGELES"
  const parte = s.match(/PARTE DE\s+([^)]+)\)/i)
  if (parte) return parte[1].trim().replace(/\s+/g, ' ')
  // "MASSACHUSETTS - BOSTON" → "BOSTON"
  if (s.includes(' - ')) s = s.split(' - ').pop().trim()
  // "SUZUKA (PROVÍNCIA DE MIE)" → "SUZUKA"
  s = s.replace(/\s*\([^)]*\)\s*/g, ' ').trim()
  s = s.replace(/\s+/g, ' ')
  // "LISBOA 2" / "PORTO 2" are extra polling rooms, not other cities
  s = s.replace(/\s+\d+$/, '').trim()
  return s || null
}

async function download(url, dest) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(dest, buf)
  return dest
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean)
  const header = lines[0].split(';').map((h) => h.replace(/^"|"$/g, ''))
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const cols = []
    let cur = ''
    let inQ = false
    const line = lines[i]
    for (let j = 0; j < line.length; j++) {
      const ch = line[j]
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
    const row = {}
    header.forEach((h, idx) => {
      row[h] = (cols[idx] || '').replace(/^"|"$/g, '')
    })
    rows.push(row)
  }
  return rows
}

async function main() {
  const work = join(tmpdir(), 'eleicoes-locmap')
  mkdirSync(work, { recursive: true })

  console.log('Fetching EA16 section config…')
  const cs = await (
    await fetch(
      `${HOST}/oficial/ele2026/arquivo-urna/${PLEITO}/config/zz/zz-p00${PLEITO}-cs.json`,
      { headers: { 'User-Agent': UA, Accept: 'application/json' } },
    )
  ).json()

  /** mun -> Set of principal section codes that received BUs */
  const principals = new Map()
  for (const mu of cs.abr?.[0]?.mu || []) {
    const mun = pad(mu.cd || '', 5)
    const set = new Set()
    for (const zon of mu.zon || []) {
      for (const sec of zon.sec || []) {
        if (!sec.ns || sec.nsp || !sec.da) continue
        set.add(pad(sec.ns, 4))
      }
    }
    if (set.size) principals.set(mun, set)
  }

  console.log('Downloading perfil_eleitor_secao_2026_ZZ…')
  const zipPath = join(work, 'perfil_zz.zip')
  await download(
    `${CDN}/estatistica/sead/odsele/perfil_eleitor_secao/perfil_eleitor_secao_2026_ZZ.zip`,
    zipPath,
  )
  execFileSync('unzip', ['-o', zipPath, '-d', work], { stdio: 'inherit' })
  const csvPath = join(work, 'perfil_eleitor_secao_2026_ZZ.csv')
  console.log('Parsing perfil CSV (streaming)…')

  // mun -> section -> localName
  const secToLocal = new Map()
  const munNames = new Map()

  // Stream parse to avoid huge memory — file is ~113MB
  const text = readFileSync(csvPath, 'latin1')
  const rows = parseCsv(text)
  for (const row of rows) {
    const mun = pad(row.CD_MUNICIPIO || '', 5)
    const sec = pad(row.NR_SECAO || '', 4)
    const name = cleanLocalName(row.NM_LOCAL_VOTACAO)
    if (!mun || !sec || !name) continue
    if (!principals.has(mun) || !principals.get(mun).has(sec)) continue
    munNames.set(mun, row.NM_MUNICIPIO || mun)
    if (!secToLocal.has(mun)) secToLocal.set(mun, new Map())
    // Prefer first non-empty; names are stable per section
    if (!secToLocal.get(mun).has(sec)) secToLocal.get(mun).set(sec, name)
  }

  /** countryId -> { municipalities: { munCode: { name, locations: { loc: sections[] } } } } */
  const byCountry = new Map()

  for (const [mun, secMap] of secToLocal) {
    const countryId = CITY_TO_COUNTRY[mun]
    if (!countryId) continue
    const locSecs = new Map()
    for (const [sec, loc] of secMap) {
      if (!locSecs.has(loc)) locSecs.set(loc, [])
      locSecs.get(loc).push(sec)
    }
    // "LISBOA" + "LISBOA 2" is two rooms in the same city, not a split.
    const collapsed = new Map()
    for (const [loc, secs] of locSecs) {
      const base = String(loc)
        .replace(/\s+\d+$/, '')
        .trim()
      if (!collapsed.has(base)) collapsed.set(base, [])
      collapsed.get(base).push(...secs)
    }
    if (collapsed.size < 2) continue // not a broad municipality

    if (!byCountry.has(countryId)) {
      byCountry.set(countryId, {
        source: {
          en: 'TSE open data (perfil eleitor por seção / NM_LOCAL_VOTACAO) + ballot boxes (arquivo-urna)',
          pt: 'Dados abertos do TSE (perfil do eleitor por seção / NM_LOCAL_VOTACAO) + boletins de urna (arquivo-urna)',
        },
        municipalities: {},
      })
    }
    const locations = {}
    for (const [loc, secs] of [...collapsed.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], 'pt'),
    )) {
      locations[loc] = [...new Set(secs)].sort()
    }
    byCountry.get(countryId).municipalities[mun] = {
      name: munNames.get(mun) || mun,
      locations,
    }
  }

  // Stable key order
  const out = {}
  for (const id of [...byCountry.keys()].sort()) {
    out[id] = byCountry.get(id)
  }

  writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n')

  const summary = Object.fromEntries(
    Object.entries(out).map(([id, cfg]) => [
      id,
      {
        muns: Object.keys(cfg.municipalities).length,
        locations: Object.values(cfg.municipalities).reduce(
          (n, m) => n + Object.keys(m.locations).length,
          0,
        ),
      },
    ]),
  )
  console.log(JSON.stringify({ countries: Object.keys(out).length, summary }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
