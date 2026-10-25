import brazil2022r2 from '../data/tse-brazil-2022-r2.json'
import type { CityResult, CountryResult, ResultsData, YearResult } from '../types'

type Brazil2022R2Cache = {
  ufs: Record<string, YearResult>
}

const brazilUf2022R2 = (brazil2022r2 as Brazil2022R2Cache).ufs ?? {}

const EMPTY_YEAR: YearResult = {
  lula: 0,
  bolsonaro: 0,
  totalValid: 0,
  lulaPct: 0,
  bolsonaroPct: 0,
}

/**
 * Remap a first-round place row into the unified schema:
 * - yRound1 / y2022Round1 hold 1º turno
 * - y2026 is empty until runoff grain exists (treated as unreported)
 * - y2022 uses runoff-2022 when provided
 */
export function remapFirstRoundPlace(
  place: CityResult,
  runoff2022?: YearResult | null,
): CityResult {
  return {
    ...place,
    yRound1: place.y2026 ?? null,
    y2022Round1: place.y2022 ?? null,
    y2026: EMPTY_YEAR,
    y2022: runoff2022 ?? null,
    swing: null,
  }
}

/** Attach 2026/2022 1º turno onto a runoff place that already has R2 fields. */
function withRoundComparePlace(
  runoff: CityResult,
  round1: CityResult | undefined,
): CityResult {
  if (!round1) return runoff
  return {
    ...runoff,
    yRound1: round1.y2026 ?? runoff.yRound1 ?? null,
    y2022Round1: round1.y2022 ?? runoff.y2022Round1 ?? null,
  }
}

function indexByCode(places: CityResult[] | undefined): Map<string, CityResult> {
  const map = new Map<string, CityResult>()
  for (const p of places ?? []) map.set(p.code, p)
  return map
}

function mergePlaceLists(
  runoffPlaces: CityResult[] | undefined,
  round1Places: CityResult[] | undefined,
  runoff2022ByCode?: Record<string, YearResult>,
): CityResult[] | undefined {
  if (!runoffPlaces?.length && !round1Places?.length) return runoffPlaces
  const r1ByCode = indexByCode(round1Places)
  if (runoffPlaces?.length) {
    return runoffPlaces.map((p) =>
      withRoundComparePlace(p, r1ByCode.get(p.code)),
    )
  }
  // Runoff seed missing this grain (e.g. Brazil UFs) — expose 1º rows remapped.
  return (round1Places ?? []).map((p) =>
    remapFirstRoundPlace(p, runoff2022ByCode?.[p.code] ?? null),
  )
}

/**
 * Build the single-experience dataset: 2026/2022 runoff as primary y2026/y2022,
 * with 1º turno attached as yRound1 / y2022Round1. Brazil UF grain is borrowed
 * from the 1º seed (runoff domestic sync still pending) and labeled correctly.
 */
export function mergeRounds(
  runoff: ResultsData,
  round1: ResultsData,
): ResultsData {
  const r1ById = new Map(round1.countries.map((c) => [c.id, c]))
  const countries = runoff.countries.map((c) => {
    const r1 = r1ById.get(c.id)
    const isBrazil = c.id === 'brazil' || Boolean(c.domestic)
    const areas = mergePlaceLists(
      c.areas,
      r1?.areas,
      isBrazil ? brazilUf2022R2 : undefined,
    )
    const cities = mergePlaceLists(c.cities, r1?.cities)
    const suburbs = mergePlaceLists(c.suburbs, r1?.suburbs)
    const merged: CountryResult = {
      ...c,
      yRound1: r1?.y2026 ?? c.yRound1 ?? null,
      y2022Round1: r1?.y2022 ?? c.y2022Round1 ?? null,
      areas,
      cities,
      // Prefer runoff cityCount when set; else keep 1º grain counts for Brazil.
      cityCount: c.cityCount || r1?.cityCount || cities?.length,
      suburbCount: c.suburbCount || r1?.suburbCount || suburbs?.length,
      suburbs,
    }
    return merged
  })

  return {
    ...runoff,
    meta: {
      ...runoff.meta,
      title: {
        en: 'Brazilian Overseas Vote',
        pt: 'Voto no Exterior',
      },
      subtitle: {
        en: '2026 runoff vs 1st round and vs 2022 — overseas by default',
        pt: '2º turno 2026 vs 1º turno e vs 2022 — exterior por padrão',
      },
    },
    countries,
  }
}

/** Remap lazy-loaded Brazil city/suburb grain (still 1º-only files) for unified UI. */
export function remapBrazilGrain(places: CityResult[]): CityResult[] {
  return places.map((p) => remapFirstRoundPlace(p, null))
}
