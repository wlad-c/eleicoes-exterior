#!/usr/bin/env node
/**
 * Build Brazil within-municipality (suburb-equivalent) presidential tallies
 * from official TSE votacao_secao open data — 2022 + 2026, 1st round.
 *
 * Grain: NR_ZONA (electoral zone) inside each município — not NM_LOCAL_VOTACAO
 * (individual voting places are too fine for the Local/Zona tab).
 *
 * Labels (G1-style): prefer official TRE zone nicknames when known
 * (e.g. Piraporinha, Bela Vista, Copacabana), else top NM_BAIRRO from
 * eleitorado_local_votacao — never opaque "Zona 001" alone.
 *
 * Writes: src/data/brazil-suburbs.json
 *
 * After rebuilding tallies, run `node scripts/enrich-suburb-coords.mjs` to
 * attach WGS84 centroids (NR_LATITUDE / NR_LONGITUDE) for the city map.
 *
 * Abstention / registered voters are overlaid from detalhe_votacao_munzona
 * (same source as `npm run apply:abstention`). Re-run apply:abstention if you
 * skip that step or rebuild cities without electorate.
 *
 * Usage: node scripts/build-brazil-locals.mjs
 */
import {
  createReadStream,
  createWriteStream,
  mkdirSync,
  writeFileSync,
  readFileSync,
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
const NICKNAMES_PATH = join(ROOT, 'scripts/data/tre-zona-nicknames.json')

const CDN = 'https://cdn.tse.jus.br'
const UA = 'eleicoes-exterior/1.0 (+brazil zona builder)'

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

/** Neighborhood registry used to name each electoral zone. */
const BAIRRO_ZIP = `${CDN}/estatistica/sead/odsele/eleitorado_locais_votacao/eleitorado_local_votacao_2026.zip`

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

const UF_LIST = Object.keys(UF_META)

function pad(n, w) {
  return String(n).padStart(w, '0')
}

function round1(n) {
  return Math.round(n * 100) / 100
}

function yearResult(lula, bolsonaro, totalValid, registered, abstentions) {
  const y = {
    lula,
    bolsonaro,
    totalValid,
    lulaPct: totalValid ? round1((lula / totalValid) * 100) : 0,
    bolsonaroPct: totalValid ? round1((bolsonaro / totalValid) * 100) : 0,
  }
  if (registered != null && registered > 0 && abstentions != null) {
    y.registered = registered
    y.abstentions = abstentions
    y.abstentionPct = round1((abstentions / registered) * 100)
  }
  return y
}

/** Zone-grain electorate from detalhe_votacao_munzona_${year}_BRASIL.csv. */
async function loadZoneElectorate(year, work) {
  const zipUrl = `${CDN}/estatistica/sead/odsele/detalhe_votacao_munzona/detalhe_votacao_munzona_${year}.zip`
  const zipPath = join(work, `detalhe_votacao_munzona_${year}.zip`)
  const csvName = `detalhe_votacao_munzona_${year}_BRASIL.csv`
  const csvPath = join(work, csvName)
  if (!existsSync(zipPath) || statSync(zipPath).size < 1000) {
    console.log(`Downloading ${zipUrl}`)
    await download(zipUrl, zipPath)
  }
  if (!existsSync(csvPath)) {
    execFileSync('unzip', ['-o', zipPath, csvName, '-d', work], {
      stdio: 'inherit',
    })
  }
  /** @type {Map<string, {registered:number, abstentions:number}>} */
  const zones = new Map()
  const rl = createInterface({
    input: createReadStream(csvPath, { encoding: 'latin1' }),
    crlfDelay: Infinity,
  })
  let header = null
  const idx = {}
  for await (const line of rl) {
    if (!header) {
      header = parseCsvLine(line).map((h) => h.replace(/^\uFEFF/, ''))
      for (const name of [
        'SG_UF',
        'CD_MUNICIPIO',
        'NR_ZONA',
        'NR_TURNO',
        'CD_CARGO',
        'QT_APTOS',
        'QT_ABSTENCOES',
      ]) {
        idx[name] = header.indexOf(name)
      }
      continue
    }
    const cols = parseCsvLine(line)
    if (cols[idx.NR_TURNO] !== '1') continue
    if (cols[idx.CD_CARGO] !== '1' && cols[idx.CD_CARGO] !== '01') continue
    const uf = cols[idx.SG_UF]
    if (!uf || uf === 'ZZ' || !UF_META[uf]) continue
    const mun = pad(cols[idx.CD_MUNICIPIO], 5)
    const zona = pad(String(cols[idx.NR_ZONA] || '').trim(), 3)
    if (!mun || mun === '00000' || !zona || zona === '000') continue
    const key = `${uf}|${mun}|${zona}`
    const registered = Number.parseInt(cols[idx.QT_APTOS] || '0', 10) || 0
    const abstentions = Number.parseInt(cols[idx.QT_ABSTENCOES] || '0', 10) || 0
    const agg = zones.get(key) || { registered: 0, abstentions: 0 }
    agg.registered += registered
    agg.abstentions += abstentions
    zones.set(key, agg)
  }
  console.log(`  ${year} zone electorate: ${zones.size}`)
  return zones
}

const TITLE_SMALL = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])

function titleCasePt(name) {
  const lower = String(name || '').toLocaleLowerCase('pt-BR')
  return lower.replace(/(^|[\s\-/'])(\S+)/g, (full, sep, word, offset) => {
    if (offset > 0 && TITLE_SMALL.has(word)) return `${sep}${word}`
    return `${sep}${word.charAt(0).toLocaleUpperCase('pt-BR')}${word.slice(1)}`
  })
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

function isNullishBairro(raw) {
  const b = String(raw || '').trim()
  if (!b) return true
  const u = b.toUpperCase()
  return u === '#NULO#' || u === '#NE#' || u === '-' || u === 'NULL'
}

async function download(url, dest) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
}

async function ensureCsv(yearCfg, work) {
  mkdirSync(work, { recursive: true })
  const csvPath = join(work, yearCfg.csv)
  if (existsSync(csvPath) && statSync(csvPath).size > 1_000_000) {
    console.log(`Reusing ${csvPath}`)
    return csvPath
  }
  // Prefer already-extracted copy from prior syncs
  const alt = join(tmpdir(), 'eleicoes-brazil-2022', yearCfg.csv)
  if (yearCfg.year === 2022 && existsSync(alt) && statSync(alt).size > 1_000_000) {
    console.log(`Linking ${alt}`)
    try {
      const { symlinkSync, unlinkSync } = await import('node:fs')
      try {
        unlinkSync(csvPath)
      } catch {
        /* */
      }
      symlinkSync(alt, csvPath)
      return csvPath
    } catch {
      /* fall through to download */
    }
  }
  const zipPath = join(work, `${yearCfg.csv}.zip`)
  if (!existsSync(zipPath) || statSync(zipPath).size < 1_000_000) {
    console.log(`Downloading ${yearCfg.zip}…`)
    await download(yearCfg.zip, zipPath)
  }
  console.log(`Unzipping ${yearCfg.csv}…`)
  execFileSync('unzip', ['-o', zipPath, yearCfg.csv, '-d', work], {
    stdio: 'inherit',
  })
  return csvPath
}

/**
 * Map `UF|munCode|zona` → top 1–2 neighborhood names (title-cased), weighted by
 * QT_ELEITOR_SECAO from eleitorado_local_votacao_2026.
 */
async function loadZoneBairros(work) {
  mkdirSync(work, { recursive: true })
  const zipPath = join(work, 'eleitorado_local_votacao_2026.zip')
  const cached = join(tmpdir(), 'eleitorado-locais', 'eleitorado_local_votacao_2026.zip')
  if (existsSync(cached) && statSync(cached).size > 1_000_000) {
    if (!existsSync(zipPath) || statSync(zipPath).size < 1_000_000) {
      console.log(`Linking bairro zip from ${cached}`)
      try {
        const { symlinkSync, unlinkSync, copyFileSync } = await import('node:fs')
        try {
          unlinkSync(zipPath)
        } catch {
          /* */
        }
        try {
          symlinkSync(cached, zipPath)
        } catch {
          copyFileSync(cached, zipPath)
        }
      } catch {
        /* fall through */
      }
    }
  }
  if (!existsSync(zipPath) || statSync(zipPath).size < 1_000_000) {
    console.log(`Downloading ${BAIRRO_ZIP}…`)
    await download(BAIRRO_ZIP, zipPath)
  }

  /** @type {Map<string, Map<string, number>>} */
  const weights = new Map()

  for (const uf of UF_LIST) {
    const entry = `eleitorado_local_votacao_2026_${uf}.csv`
    const csvPath = join(work, entry)
    if (!existsSync(csvPath) || statSync(csvPath).size < 10_000) {
      execFileSync('unzip', ['-o', '-j', zipPath, entry, '-d', work], {
        stdio: 'pipe',
      })
    }
    console.log(`  bairros ${uf}…`)
    const rl = createInterface({
      input: createReadStream(csvPath, { encoding: 'latin1' }),
      crlfDelay: Infinity,
    })
    let header = null
    const idx = {}
    for await (const line of rl) {
      if (!header) {
        header = parseCsvLine(line).map((h) => h.replace(/^\uFEFF/, ''))
        for (const name of [
          'SG_UF',
          'CD_MUNICIPIO',
          'NR_ZONA',
          'NR_TURNO',
          'NM_BAIRRO',
          'QT_ELEITOR_SECAO',
        ]) {
          idx[name] = header.indexOf(name)
        }
        if (idx.NM_BAIRRO < 0) {
          throw new Error(`${entry} missing NM_BAIRRO`)
        }
        continue
      }
      const cols = parseCsvLine(line)
      if (cols[idx.NR_TURNO] !== '1') continue
      const rowUf = cols[idx.SG_UF] || uf
      if (!UF_META[rowUf]) continue
      const bairro = cols[idx.NM_BAIRRO]
      if (isNullishBairro(bairro)) continue
      const zona = pad(cols[idx.NR_ZONA], 3)
      const munCode = pad(cols[idx.CD_MUNICIPIO], 5)
      const qt = Number.parseInt(cols[idx.QT_ELEITOR_SECAO], 10) || 0
      if (!qt) continue
      const key = `${rowUf}|${munCode}|${zona}`
      let bag = weights.get(key)
      if (!bag) {
        bag = new Map()
        weights.set(key, bag)
      }
      bag.set(bairro, (bag.get(bairro) || 0) + qt)
    }
  }

  /** @type {Map<string, string[]>} */
  const top = new Map()
  for (const [key, bag] of weights) {
    const ranked = [...bag.entries()].sort((a, b) => b[1] - a[1])
    const picked = [ranked[0][0]]
    // Second neighborhood only when it is a meaningful share of the top one.
    if (ranked.length > 1 && ranked[1][1] >= ranked[0][1] * 0.25) {
      picked.push(ranked[1][0])
    }
    top.set(
      key,
      picked.map((n) => titleCasePt(n)),
    )
  }
  console.log(`  zone→bairro labels for ${top.size} zones`)
  return top
}

/**
 * Accumulate Map key → { uf, munCode, munName, zona, lula, bolsonaro, totalValid }
 * Grain: electoral zone (NR_ZONA) within município.
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
        'NR_ZONA',
        'NR_TURNO',
        'CD_CARGO',
        'DS_CARGO',
        'NR_VOTAVEL',
        'QT_VOTOS',
      ]) {
        idx[name] = header.indexOf(name)
      }
      if (idx.NR_ZONA < 0) {
        throw new Error('CSV missing NR_ZONA — cannot build zona grain')
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
    const zonaRaw = String(cols[idx.NR_ZONA] || '').trim()
    if (!zonaRaw) continue
    const zona = pad(zonaRaw, 3)
    const munCode = pad(cols[idx.CD_MUNICIPIO], 5)
    const munName = cols[idx.NM_MUNICIPIO] || munCode
    const key = `${uf}|${munCode}|${zona}`
    let row = into.get(key)
    if (!row) {
      row = {
        uf,
        munCode,
        munName,
        zona,
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
  console.log(`  aggregated ${rows} vote lines → ${into.size} zones`)
}

function loadOfficialNicknames() {
  /** @type {Map<string, string>} */
  const map = new Map()
  if (!existsSync(NICKNAMES_PATH)) {
    console.warn(`No ${NICKNAMES_PATH} — falling back to bairro labels only`)
    return map
  }
  const data = JSON.parse(readFileSync(NICKNAMES_PATH, 'utf8'))
  for (const [key, name] of Object.entries(data.zones || {})) {
    if (name) map.set(key, String(name))
  }
  console.log(`  loaded ${map.size} official TRE zone nicknames`)
  return map
}

/**
 * G1-style place label: one recognizable neighborhood/region name when possible.
 * @param {string[]|undefined} bairros
 * @param {string|undefined} nickname
 * @param {string} zona
 */
function zoneLabels(bairros, nickname, zona) {
  const zonaPt = `Zona ${zona}`
  const zonaEn = `Zone ${zona}`
  if (nickname) {
    return { namePt: nickname, nameEn: nickname, labelKind: 'tre-nickname' }
  }
  if (bairros?.length) {
    const place = bairros.join(' / ')
    return { namePt: place, nameEn: place, labelKind: 'bairro' }
  }
  return { namePt: zonaPt, nameEn: zonaEn, labelKind: 'zona' }
}

async function main() {
  const work = join(tmpdir(), 'eleicoes-brazil-locals')
  const by2022 = new Map()
  const by2026 = new Map()

  console.log('\n=== zone neighborhood labels ===')
  const nicknames = loadOfficialNicknames()
  const bairroByZone = await loadZoneBairros(work)

  for (const cfg of YEARS) {
    console.log(`\n=== ${cfg.year} ===`)
    const csvPath = await ensureCsv(cfg, work)
    await aggregateYear(csvPath, cfg.year === 2022 ? by2022 : by2026)
  }

  console.log('\n=== zone electorate (abstention) ===')
  const el2026 = await loadZoneElectorate(2026, work)
  const el2022 = await loadZoneElectorate(2022, work)

  const keys = new Set([...by2022.keys(), ...by2026.keys()])
  const suburbs = []
  let labeled = 0
  let nicknamed = 0
  for (const key of keys) {
    const a = by2026.get(key)
    const b = by2022.get(key)
    const base = a || b
    const e26 = el2026.get(key)
    const e22 = el2022.get(key)
    const y2026 = a
      ? yearResult(
          a.lula,
          a.bolsonaro,
          a.totalValid,
          e26?.registered,
          e26?.abstentions,
        )
      : null
    const y2022 = b
      ? yearResult(
          b.lula,
          b.bolsonaro,
          b.totalValid,
          e22?.registered,
          e22?.abstentions,
        )
      : null
    if (!y2026) continue
    const munPretty = titleCasePt(base.munName)
    const bairros = bairroByZone.get(key)
    const nickname = nicknames.get(key)
    const { namePt, nameEn, labelKind } = zoneLabels(
      bairros,
      nickname,
      base.zona,
    )
    if (labelKind !== 'zona') labeled += 1
    if (labelKind === 'tre-nickname') nicknamed += 1
    const zonaPt = `Zona ${base.zona}`
    const zonaEn = `Zone ${base.zona}`
    // Parent line keeps the official zone number so the opaque TSE id stays findable.
    const areaPt = `${base.uf} · ${munPretty} · ${zonaPt}`
    const areaEn = `${base.uf} · ${munPretty} · ${zonaEn}`
    const row = {
      code: `${base.uf}-${base.munCode}-Z${base.zona}`,
      name: namePt,
      nameEn,
      namePt,
      level: 'suburb',
      area: `${base.uf} · ${base.munName} · ${zonaPt}`,
      areaEn,
      areaPt,
      y2026,
    }
    if (y2022) row.y2022 = y2022
    suburbs.push(row)
  }

  suburbs.sort((a, b) => {
    const area = a.area.localeCompare(b.area, 'pt')
    if (area !== 0) return area
    return a.name.localeCompare(b.name, 'pt', { numeric: true })
  })

  writeFileSync(
    OUT,
    JSON.stringify(
      {
        countryId: 'brazil',
        grain: 'zona',
        labelSource: 'tre-zona-nicknames + eleitorado_local_votacao.NM_BAIRRO',
        updatedAt: new Date().toISOString(),
        count: suburbs.length,
        labeled,
        nicknamed,
        suburbs,
      },
      null,
      0,
    ) + '\n',
  )
  console.log(
    `\nWrote ${suburbs.length} electoral zones (${labeled} labeled, ${nicknamed} TRE nicknames) → ${OUT}`,
  )

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
