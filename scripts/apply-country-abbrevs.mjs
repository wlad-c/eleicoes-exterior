#!/usr/bin/env node
/**
 * Apply language-aware country abbreviations from country-abbrevs.json
 * onto results.json (src + docs). Safe to re-run after syncs.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const ABBREVS_PATH = join(ROOT, 'src/data/country-abbrevs.json')

function patch(path, byIso3) {
  const data = JSON.parse(readFileSync(path, 'utf8'))
  let updated = 0
  const missing = []
  data.countries = data.countries.map((c) => {
    const a = byIso3[c.iso3]
    if (!a) {
      missing.push(`${c.iso3} (${c.id})`)
      return {
        ...c,
        abbrevEn: c.abbrevEn || c.iso3,
        abbrevPt: c.abbrevPt || c.iso3,
      }
    }
    if (c.abbrevEn !== a.en || c.abbrevPt !== a.pt) updated += 1
    const {
      id,
      countryEn,
      countryPt,
      iso3,
      abbrevEn: _oldEn,
      abbrevPt: _oldPt,
      region,
      y2022,
      y2026,
      swing,
      notes,
      status,
      coverage,
      cities,
      locations,
      ...rest
    } = c
    return {
      id,
      countryEn,
      countryPt,
      iso3,
      abbrevEn: a.en,
      abbrevPt: a.pt,
      region,
      y2022,
      y2026,
      swing,
      notes,
      status,
      coverage,
      ...(cities ? { cities } : {}),
      ...(locations ? { locations } : {}),
      ...rest,
    }
  })
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n')
  return { updated, missing, total: data.countries.length }
}

const byIso3 = JSON.parse(readFileSync(ABBREVS_PATH, 'utf8')).byIso3
for (const rel of ['src/data/results.json', 'docs/data/results.json']) {
  const result = patch(join(ROOT, rel), byIso3)
  console.log(
    `${rel}: ${result.total} countries, ${result.updated} updated` +
      (result.missing.length ? `, missing: ${result.missing.join(', ')}` : ''),
  )
}
