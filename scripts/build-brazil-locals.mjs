#!/usr/bin/env node
/**
 * Build Brazil within-municipality (suburb-equivalent) presidential tallies
 * from official TSE votacao_secao open data — 2022 + 2026, 1st round.
 *
 * Grain: NM_LOCAL_VOTACAO inside each município (UF + CD_MUNICIPIO).
 * Writes: src/data/brazil-suburbs.json
 *
 * Usage: node scripts/build-brazil-locals.mjs
 */
import {
  createReadStream,
  createWriteStream,
  mkdirSync,
  writeFileSync,
  existsSync,
  statSync,
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
const OUT = join(ROOT, 'src/data/brazil-suburbs.json')
const RESULTS_PATH = join(ROOT, 'src/data/results.json')

const CDN = 'https://cdn.tse.jus.br'
const UA = 'eleicoes-exterior/1.0 (+brazil locals builder)'

const YEARS = [
  {
    year: 2022,
    zip: `${CDN}/estatistica/sead/odsele/votacao_secao/votacao_secao_2022_BR.zip`,
    csv: 'votacao_secao_2022_BR.csv',
  },
  {
    year: 2026,
    zip: `${CDN}/estatistica/sead/odsele/votacao_secao/votacao_secao_2026_BR.zip`,
    csv: 'votacao_secao_2026_BR.csv',
  },
]

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

function titleCasePt(name) {
  return String(name || '')
    .toLocaleLowerCase('pt-BR')
    .replace(
      /(^|[\s\-/'])(\S)/g,
      (_, sep, ch) => `${sep}${ch.toLocaleUpperCase('pt-BR')}`,
    )
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

async function ensureCsv(yearCfg, work) {
  mkdirSync(work, { recursive: true })
  const zipPath = join(work, `${yearCfg.csv}.zip`)
  const csvPath = join(work, yearCfg.csv)
  if (existsSync(csvPath) && statSync(csvPath).size > 1_000_000) {
    console.log(`Reusing ${csvPath}`)
    return csvPath
  }
  console.log(`Downloading ${yearCfg.zip}…`)
  const res = await fetch(yearCfg.zip, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${yearCfg.zip}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(zipPath))
  console.log(`Extracting ${yearCfg.csv}…`)
  execFileSync('unzip', ['-o', zipPath, yearCfg.csv, '-d', work], {
    stdio: 'inherit',
  })
  return csvPath
}

/**
 * Accumulate Map key → { uf, munCode, munName, local, lula, bolsonaro, totalValid }
 */
async function aggregateYear(csvPath, into) {
  const rl = createInterface({
    input: createReadStream(csvPath, { encoding: 'latin1' }),
    crlfDelay: Infinity,
  })
  let header = null
  const idx = {}
  let rows = 0
  for await (const line of rl) {
    if (!header) {
      header = parseCsvLine(line).map((h) => h.replace(/^\uFEFF/, ''))
      for (const name of [
        'SG_UF',
        'CD_MUNICIPIO',
        'NM_MUNICIPIO',
        'NR_TURNO',
        'CD_CARGO',
        'DS_CARGO',
        'NR_VOTAVEL',
        'QT_VOTOS',
        'NM_LOCAL_VOTACAO',
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
    if (nr === '95' || nr === '96' || nr === '97') continue
    const votes = Number.parseInt(cols[idx.QT_VOTOS], 10) || 0
    if (!votes) continue
    const local = (cols[idx.NM_LOCAL_VOTACAO] || '').trim()
    if (!local) continue
    const munCode = pad(cols[idx.CD_MUNICIPIO], 5)
    const munName = cols[idx.NM_MUNICIPIO] || munCode
    const key = `${uf}|${munCode}|${local.toUpperCase()}`
    let row = into.get(key)
    if (!row) {
      row = {
        uf,
        munCode,
        munName,
        local,
        lula: 0,
        bolsonaro: 0,
        totalValid: 0,
      }
      into.set(key, row)
    }
    row.totalValid += votes
    if (nr === '13') row.lula += votes
    else if (nr === '22') row.bolsonaro += votes
    rows += 1
  }
  console.log(`  aggregated ${rows} vote lines → ${into.size} locals`)
}

async function main() {
  const work = join(tmpdir(), 'eleicoes-brazil-locals')
  const by2022 = new Map()
  const by2026 = new Map()

  for (const cfg of YEARS) {
    console.log(`\n=== ${cfg.year} ===`)
    const csvPath = await ensureCsv(cfg, work)
    await aggregateYear(csvPath, cfg.year === 2022 ? by2022 : by2026)
  }

  // Union keys from both years
  const keys = new Set([...by2022.keys(), ...by2026.keys()])
  const suburbs = []
  for (const key of keys) {
    const a = by2026.get(key)
    const b = by2022.get(key)
    const base = a || b
    const y2026 = a
      ? yearResult(a.lula, a.bolsonaro, a.totalValid)
      : null
    const y2022 = b
      ? yearResult(b.lula, b.bolsonaro, b.totalValid)
      : null
    if (!y2026 && !y2022) continue
    // Prefer rows that have 2026; keep 2022-only as pending-style with zeros? Skip 2022-only for cleaner UI.
    if (!y2026) continue
    const munPretty = titleCasePt(base.munName)
    const localPretty = titleCasePt(base.local)
    const row = {
      code: `${base.uf}-${base.munCode}-${base.local.toUpperCase()}`,
      name: base.local,
      nameEn: localPretty,
      namePt: localPretty,
      level: 'suburb',
      area: `${base.uf} · ${base.munName}`,
      areaEn: `${base.uf} · ${munPretty}`,
      areaPt: `${base.uf} · ${munPretty}`,
      y2026,
    }
    if (y2022) row.y2022 = y2022
    // swing is derived client-side from y2022/y2026
    suburbs.push(row)
  }

  suburbs.sort((a, b) => {
    const area = a.area.localeCompare(b.area, 'pt')
    if (area !== 0) return area
    return a.name.localeCompare(b.name, 'pt')
  })

  writeFileSync(
    OUT,
    JSON.stringify(
      {
        countryId: 'brazil',
        updatedAt: new Date().toISOString(),
        count: suburbs.length,
        suburbs,
      },
      null,
      0,
    ) + '\n',
  )
  console.log(`\nWrote ${suburbs.length} suburbs → ${OUT}`)

  // Patch suburbCount on results.json Brazil row
  try {
    const results = JSON.parse(
      await import('node:fs').then((fs) =>
        fs.readFileSync(RESULTS_PATH, 'utf8'),
      ),
    )
    const br = results.countries.find((c) => c.id === 'brazil')
    if (br) {
      br.suburbCount = suburbs.length
      br.suburbs = []
      writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2) + '\n')
      console.log(`Updated results.json suburbCount=${suburbs.length}`)
    }
  } catch (err) {
    console.warn('Could not patch results.json:', err.message)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
