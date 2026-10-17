#!/usr/bin/env node
/**
 * Scaffold src/data/results-runoff.json from the frozen 1º turno seed:
 * same geography, pending 2026 R2 tallies, optional 2022 R2 historical
 * when tse-country-2022-r2.json / tse-city-2022-r2.json exist.
 *
 * Usage: node scripts/scaffold-runoff.mjs
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const R1_PATH = join(ROOT, 'src/data/results.json')
const OUT_PATH = join(ROOT, 'src/data/results-runoff.json')
const COUNTRY_R2 = join(ROOT, 'src/data/tse-country-2022-r2.json')
const CITY_R2 = join(ROOT, 'src/data/tse-city-2022-r2.json')
const CITY_MAP = join(ROOT, 'src/data/tse-city-map.json')

const ROUND2_ELEICAO = '6258'

function round1(n) {
  return Math.round(n * 100) / 100
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

function stripVotes(place) {
  return {
    ...place,
    y2026: null,
    y2022: place.y2022 ?? null,
    swing: null,
    coverage: null,
  }
}

function main() {
  const r1 = JSON.parse(readFileSync(R1_PATH, 'utf8'))
  const countryR2 = existsSync(COUNTRY_R2)
    ? JSON.parse(readFileSync(COUNTRY_R2, 'utf8'))
    : {}
  const cityR2 = existsSync(CITY_R2)
    ? JSON.parse(readFileSync(CITY_R2, 'utf8'))
    : {}
  const cityMap = existsSync(CITY_MAP)
    ? JSON.parse(readFileSync(CITY_MAP, 'utf8'))
    : {}

  // mun code → country for area y2022 overlay
  const munToCountry = cityMap

  const countries = r1.countries.map((c) => {
    const y2022 = countryR2[c.id] || null
    const areas = (c.areas || []).map((a) => {
      const hist = cityR2[a.code]
      const y22 = hist
        ? {
            lula: hist.lula,
            bolsonaro: hist.bolsonaro,
            totalValid: hist.totalValid,
            lulaPct: hist.lulaPct,
            bolsonaroPct: hist.bolsonaroPct,
            ...(hist.registered != null ? { registered: hist.registered } : {}),
            ...(hist.abstentions != null
              ? { abstentions: hist.abstentions }
              : {}),
            ...(hist.blank != null ? { blank: hist.blank } : {}),
            ...(hist.nullVotes != null ? { nullVotes: hist.nullVotes } : {}),
            ...(hist.noValidVote != null
              ? { noValidVote: hist.noValidVote }
              : {}),
            ...(hist.noValidVotePct != null
              ? { noValidVotePct: hist.noValidVotePct }
              : {}),
          }
        : null
      return {
        ...a,
        y2026: {
          lula: 0,
          bolsonaro: 0,
          totalValid: 0,
          lulaPct: 0,
          bolsonaroPct: 0,
        },
        y2022: y22,
        swing: null,
        coverage: null,
      }
    })

    // Keep city shells without 2026 votes; drop suburb payloads (lazy Brazil).
    const cities = (c.cities || []).map((city) => ({
      ...city,
      y2026: {
        lula: 0,
        bolsonaro: 0,
        totalValid: 0,
        lulaPct: 0,
        bolsonaroPct: 0,
      },
      // Keep 2022 only if we later apply location R2; clear for scaffold.
      y2022: null,
      swing: null,
      coverage: null,
    }))

    return {
      ...c,
      y2026: null,
      y2022: y2022 || {
        lula: 0,
        bolsonaro: 0,
        totalValid: 0,
        lulaPct: 0,
        bolsonaroPct: 0,
      },
      swing: null,
      coverage: null,
      status: 'pending',
      source: undefined,
      notes:
        c.domestic
          ? 'Runoff domestic — pending official TSE totalization'
          : 'Runoff — pending booth close / BU / TSE',
      areas: c.domestic ? undefined : areas,
      cities: c.domestic ? undefined : cities.length ? cities : undefined,
      suburbs: undefined,
      // Preserve lazy counts for Brazil Include on runoff tab.
      cityCount: c.domestic ? c.cityCount : undefined,
      suburbCount: c.domestic ? c.suburbCount : undefined,
    }
  })

  // Fix empty y2022 placeholders when we truly have no R2 hist
  for (const c of countries) {
    if (
      c.y2022 &&
      c.y2022.totalValid === 0 &&
      !countryR2[c.id]
    ) {
      // Keep zeroed structure so tables don't crash; swing stays null
    }
    void munToCountry
    void stripVotes
    void swingOf
  }

  const out = {
    meta: {
      title: {
        en: 'Brazilian Overseas Vote — Runoff',
        pt: 'Voto no Exterior — 2º Turno',
      },
      subtitle: {
        en: '2026 runoff vs 2022 runoff abroad (TSE when published; press BUs until then)',
        pt: '2º turno 2026 vs 2º turno 2022 no exterior (TSE quando publicado; BUs da imprensa até lá)',
      },
      updatedAt: new Date().toISOString(),
      sources: [
        {
          name: 'TSE Dados Abertos — 2022 2nd round',
          url: 'https://dadosabertos.tse.jus.br/',
          role: {
            en: 'Official 2022 runoff overseas presidential results (votação por seção, UF ZZ, 2º turno)',
            pt: 'Resultados oficiais do 2º turno 2022 no exterior (votação por seção, UF ZZ)',
          },
        },
        {
          name: 'TSE Resultados 2026 (EA20 ZZ, eleição 6258)',
          url: 'https://resultados.tse.jus.br/',
          role: {
            en: 'Official overseas presidential runoff totalization — primary 2026 source',
            pt: 'Totalização oficial do 2º turno no exterior — fonte primária de 2026',
          },
        },
        {
          name: 'Press BU roundups (g1, Exame, Poder360, …)',
          url: 'https://g1.globo.com/',
          role: {
            en: 'Secondary — scraped/curated BUs only where TSE has not yet published',
            pt: 'Secundário — BUs raspados/curados só onde o TSE ainda não publicou',
          },
        },
      ],
      defaultMapMetric: 'leader2026',
      candidates: r1.meta.candidates,
      tseZz: {
        election: ROUND2_ELEICAO,
        fetchedAt: new Date().toISOString(),
        sectionsCounted: 0,
        sectionsTotal: r1.meta.tseZz?.sectionsTotal ?? 0,
        sectionsPct: 0,
        lula: 0,
        bolsonaro: 0,
        totalValid: 0,
        url: `https://resultados.tse.jus.br/oficial/ele2026/${ROUND2_ELEICAO}/dados/zz/zz-c0001-e00${ROUND2_ELEICAO}-u.json`,
      },
    },
    countries,
  }

  writeFileSync(OUT_PATH, JSON.stringify(out) + '\n')
  const pending = countries.filter((c) => c.status === 'pending').length
  const withHist = countries.filter(
    (c) => c.y2022 && c.y2022.totalValid > 0,
  ).length
  console.log(
    `Wrote ${OUT_PATH} (${countries.length} countries, ${pending} pending, ${withHist} with 2022 R2 hist)`,
  )
}

main()
