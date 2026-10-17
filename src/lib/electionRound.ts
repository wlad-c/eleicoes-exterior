import type { ResultsData } from '../types'

/** Presidential election rounds for this app. */
export type ElectionRound = '1' | '2'

export const ROUND1_ELEICAO = '6257'
/** TSE `cdt2` for federal president — 2º turno 2026. */
export const ROUND2_ELEICAO = '6258'

export const CICLO = 'ele2026'
export const CARGO_PRESIDENTE = '1'
export const AMBIENTE = 'oficial'

/** First overseas booths close in New Zealand (17:00 NZDT on runoff Sunday). */
export const RUNOFF_REFRESH_START_MS = Date.parse('2026-10-25T04:00:00.000Z')

/** Steady-state poll while counting continues after the night-of window. */
export const RESULTS_REFRESH_MS = 30 * 60 * 1000

/**
 * Fast poll on runoff night. From NZ close through ~36h (covers Americas
 * close + early TSE totalization), then settle to RESULTS_REFRESH_MS.
 */
export const RESULTS_REFRESH_FAST_MS = 2 * 60 * 1000
export const RUNOFF_FAST_UNTIL_MS =
  RUNOFF_REFRESH_START_MS + 36 * 60 * 60 * 1000

export const ROUND_STORAGE_KEY = 'eleicoes-exterior-round-v1'

export function eleicaoForRound(round: ElectionRound): string {
  return round === '2' ? ROUND2_ELEICAO : ROUND1_ELEICAO
}

export function isRefreshPaused(now = Date.now()): boolean {
  return now < RUNOFF_REFRESH_START_MS
}

/** Override with `?refreshMs=<ms>`; otherwise null while paused. */
export function resolveRefreshMs(
  search = typeof window !== 'undefined' ? window.location.search : '',
  now = Date.now(),
): number | null {
  const raw = new URLSearchParams(search).get('refreshMs')
  if (raw && /^\d+$/.test(raw)) return Math.max(1_000, Number(raw))
  if (isRefreshPaused(now)) return null
  if (now < RUNOFF_FAST_UNTIL_MS) return RESULTS_REFRESH_FAST_MS
  return RESULTS_REFRESH_MS
}

/** Default tab: 2º after NZ close; otherwise 1º. */
export function defaultElectionRound(now = Date.now()): ElectionRound {
  return now >= RUNOFF_REFRESH_START_MS ? '2' : '1'
}

export function readStoredRound(): ElectionRound | null {
  try {
    const v = localStorage.getItem(ROUND_STORAGE_KEY)
    if (v === '1' || v === '2') return v
  } catch {
    /* ignore */
  }
  return null
}

export function writeStoredRound(round: ElectionRound): void {
  try {
    localStorage.setItem(ROUND_STORAGE_KEY, round)
  } catch {
    /* ignore */
  }
}

export function resultsSeedUrl(round: ElectionRound): string {
  const file = round === '2' ? 'results-runoff.json' : 'results.json'
  return `${import.meta.env.BASE_URL}data/${file}`
}

export function brazilCitiesUrl(round: ElectionRound): string {
  const file =
    round === '2' ? 'brazil-cities-runoff.json' : 'brazil-cities.json'
  return `${import.meta.env.BASE_URL}data/${file}`
}

export function brazilSuburbsUrl(round: ElectionRound): string {
  const file =
    round === '2' ? 'brazil-suburbs-runoff.json' : 'brazil-suburbs.json'
  return `${import.meta.env.BASE_URL}data/${file}`
}

export function roundMetaTitle(round: ElectionRound): {
  en: string
  pt: string
} {
  if (round === '2') {
    return {
      en: 'Brazilian Overseas Vote — Runoff',
      pt: 'Voto no Exterior — 2º Turno',
    }
  }
  return {
    en: 'Brazilian Overseas Vote — 1st Round',
    pt: 'Voto no Exterior — 1º Turno',
  }
}

/** Ensure meta carries the election id used by live/sync clients. */
export function withRoundElection(
  data: ResultsData,
  round: ElectionRound,
): ResultsData {
  const election = eleicaoForRound(round)
  const tseZz = data.meta.tseZz
    ? { ...data.meta.tseZz, election }
    : {
        election,
        fetchedAt: data.meta.updatedAt,
        sectionsCounted: 0,
        sectionsTotal: 0,
        sectionsPct: 0,
        lula: 0,
        bolsonaro: 0,
        totalValid: 0,
        url: `https://resultados.tse.jus.br/${AMBIENTE}/${CICLO}/${election}/dados/zz/zz-c0001-e${election.padStart(6, '0')}-u.json`,
      }
  return {
    ...data,
    meta: {
      ...data.meta,
      tseZz,
    },
  }
}
