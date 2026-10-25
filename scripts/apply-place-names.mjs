#!/usr/bin/env node
/**
 * Apply bilingual area/city display names from place-names.json
 * onto results.json (src + docs). Safe to re-run after TSE syncs.
 *
 * Keeps TSE `name` / `area` keys; adds nameEn, namePt, areaEn, areaPt.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const NAMES_PATH = join(ROOT, 'src/data/place-names.json')

/** Official IBGE/TSE UF abbreviations — keep uppercase, never title-case to "Sp". */
const BRAZIL_UFS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE',
  'TO',
])

function titleCasePt(name) {
  return String(name)
    .toLocaleLowerCase('pt-BR')
    .replace(/(^|[\s\-/'])(\S)/g, (_, sep, ch) => `${sep}${ch.toLocaleUpperCase('pt-BR')}`)
}

function lookup(byTse, raw) {
  if (!raw) return null
  const key = String(raw).toUpperCase()
  if (BRAZIL_UFS.has(key)) return { en: key, pt: key }
  const hit = byTse[key] || byTse[raw]
  if (hit) return hit
  const titled = titleCasePt(raw)
  return { en: titled, pt: titled }
}

function isMapped(byTse, raw) {
  if (!raw) return true
  const key = String(raw).toUpperCase()
  return BRAZIL_UFS.has(key) || Boolean(byTse[key] || byTse[raw])
}

function patchPlace(place, byTse, missing) {
  const names = lookup(byTse, place.name)
  if (!isMapped(byTse, place.name)) missing.add(place.name)
  const out = {
    ...place,
    nameEn: names.en,
    namePt: names.pt,
  }
  if (place.area) {
    const areaNames = lookup(byTse, place.area)
    if (!isMapped(byTse, place.area)) missing.add(place.area)
    out.areaEn = areaNames.en
    out.areaPt = areaNames.pt
  }
  return out
}

function patch(path, byTse) {
  const data = JSON.parse(readFileSync(path, 'utf8'))
  const missing = new Set()
  let places = 0
  for (const c of data.countries) {
    if (c.areas?.length) {
      c.areas = c.areas.map((p) => {
        places += 1
        return patchPlace(p, byTse, missing)
      })
    }
    if (c.cities?.length) {
      c.cities = c.cities.map((p) => {
        places += 1
        return patchPlace(p, byTse, missing)
      })
    }
  }
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n')
  return { places, missing: [...missing].sort() }
}

const byTse = JSON.parse(readFileSync(NAMES_PATH, 'utf8')).byTseName
for (const rel of ['src/data/results.json', 'docs/data/results.json']) {
  const result = patch(join(ROOT, rel), byTse)
  console.log(
    `${rel}: ${result.places} places` +
      (result.missing.length
        ? `, unmapped (title-cased fallback): ${result.missing.join(', ')}`
        : ''),
  )
}
