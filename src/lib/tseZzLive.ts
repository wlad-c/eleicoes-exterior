import cityMap from '../data/tse-city-map.json'
import type { CountryResult, ResultsData, YearResult } from '../types'

const ELEICAO = '6257'
const CARGO = '1'
const CICLO = 'ele2026'
const AMBIENTE = 'oficial'

/**
 * On localhost, Vite proxies `/tse-api` → resultados.tse.jus.br.
 * On github.io, the browser calls TSE directly (CORS allow-list).
 */
export function tseBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (host === 'localhost' || host === '127.0.0.1') return '/tse-api'
  }
  return 'https://resultados.tse.jus.br'
}

function pad(n: string | number, w: number): string {
  return String(n).padStart(w, '0')
}

function parseIntPT(v: unknown): number {
  if (v == null) return 0
  return Number.parseInt(String(v).replace(/\./g, ''), 10) || 0
}

function parsePct(v: unknown): number {
  if (v == null) return 0
  return (
    Number.parseFloat(String(v).replace(/\./g, '').replace(',', '.')) || 0
  )
}

function round1(n: number): number {
  return Math.round(n * 100) / 100
}

function yearResult(lula: number, bolsonaro: number, totalValid: number): YearResult {
  return {
    lula,
    bolsonaro,
    totalValid,
    lulaPct: totalValid ? round1((lula / totalValid) * 100) : 0,
    bolsonaroPct: totalValid ? round1((bolsonaro / totalValid) * 100) : 0,
  }
}

function swingOf(y2022: YearResult, y2026: YearResult) {
  const lulaPp = round1(y2026.lulaPct - y2022.lulaPct)
  const bolsonaroPp = round1(y2026.bolsonaroPct - y2022.bolsonaroPct)
  return {
    lulaPp,
    bolsonaroPp,
    marginPp: round1(lulaPp - bolsonaroPp),
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return res.json() as Promise<T>
}

function ea20Url(base: string, municipioCode = ''): string {
  const mun = municipioCode ? pad(municipioCode, 5) : ''
  const file = `zz${mun}-c${pad(CARGO, 4)}-e${pad(ELEICAO, 6)}-u.json`
  return `${base}/${AMBIENTE}/${CICLO}/${ELEICAO}/dados/zz/${file}`
}

type Ea20Doc = {
  s?: { st?: string; ts?: string; pst?: string }
  v?: { vv?: string; vvc?: string }
  carg?: Array<{
    cd?: string
    agr?: Array<{
      par?: Array<{ cand?: Array<{ n?: string; vap?: string }> }>
    }>
  }>
}

function extractCandidates(doc: Ea20Doc): { lula: number; bolsonaro: number } {
  const carg =
    (doc.carg || []).find((c) => String(c.cd) === CARGO) || doc.carg?.[0]
  let lula = 0
  let bolsonaro = 0
  for (const agr of carg?.agr || []) {
    for (const par of agr.par || []) {
      for (const cand of par.cand || []) {
        const n = String(cand.n)
        const vap = parseIntPT(cand.vap)
        if (n === '13') lula = vap
        if (n === '22') bolsonaro = vap
      }
    }
  }
  return { lula, bolsonaro }
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  async function run() {
    while (i < items.length) {
      const idx = i++
      out[idx] = await worker(items[idx])
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => run()),
  )
  return out
}

type Agg = {
  lula: number
  bolsonaro: number
  totalValid: number
  counted: number
  total: number
  cities: string[]
}

/**
 * Pull official TSE EA20 ZZ presidential tallies and overlay onto `base`.
 * Throws if the TSE endpoints are unreachable (caller keeps last good data).
 */
export async function fetchLiveTseZz(base: ResultsData): Promise<ResultsData> {
  const baseUrl = tseBaseUrl()
  const byId = new Map(base.countries.map((c) => [c.id, c]))
  const cityToCountry = cityMap as Record<string, string>

  const munUrl = `${baseUrl}/${AMBIENTE}/${CICLO}/${ELEICAO}/config/mun-e${pad(ELEICAO, 6)}-cm.json`
  const abUrl = `${baseUrl}/${AMBIENTE}/${CICLO}/${ELEICAO}/dados/zz/zz-e${pad(ELEICAO, 6)}-ab.json`
  const zzUrl = ea20Url(baseUrl)

  const [mun, ab, zzAgg] = await Promise.all([
    fetchJson<{ abr?: Array<{ cd?: string; mu?: Array<{ cd?: string; nm?: string }> }> }>(
      munUrl,
    ),
    fetchJson<{
      abr?: Array<{ cdabr?: string; s?: { st?: string; ts?: string } }>
    }>(abUrl),
    fetchJson<Ea20Doc>(zzUrl),
  ])

  const zzMun = (mun.abr || []).find((a) => String(a.cd).toLowerCase() === 'zz')
  const names = Object.fromEntries(
    (zzMun?.mu || []).map((m) => [pad(m.cd || '', 5), m.nm || '']),
  )

  const codes: string[] = []
  for (const row of ab.abr || []) {
    const code = pad(row.cdabr || '', 5)
    if (!code || code.toLowerCase() === '000zz' || String(row.cdabr).toLowerCase() === 'zz') {
      continue
    }
    const st = parseIntPT(row.s?.st)
    const ts = parseIntPT(row.s?.ts)
    if (st > 0 && ts > 0 && cityToCountry[code] && byId.has(cityToCountry[code])) {
      codes.push(code)
    }
  }

  const aggregates = new Map<string, Agg>()

  await mapPool(codes, 12, async (code) => {
    const countryId = cityToCountry[code]
    try {
      const doc = await fetchJson<Ea20Doc>(ea20Url(baseUrl, code))
      const { lula, bolsonaro } = extractCandidates(doc)
      const totalValid = parseIntPT(doc.v?.vv ?? doc.v?.vvc)
      const counted = parseIntPT(doc.s?.st)
      const total = parseIntPT(doc.s?.ts)
      if (totalValid <= 0 && counted <= 0) return null
      const city = names[code] || code
      const agg = aggregates.get(countryId) || {
        lula: 0,
        bolsonaro: 0,
        totalValid: 0,
        counted: 0,
        total: 0,
        cities: [],
      }
      agg.lula += lula
      agg.bolsonaro += bolsonaro
      agg.totalValid += totalValid
      agg.counted += counted
      agg.total += total
      agg.cities.push(`${city} ${counted}/${total}`)
      aggregates.set(countryId, agg)
    } catch {
      /* skip one municipality; keep others */
    }
    return null
  })

  const countries: CountryResult[] = base.countries.map((country) => {
    const agg = aggregates.get(country.id)
    if (!agg || agg.totalValid <= 0) return country
    const y2026 = yearResult(agg.lula, agg.bolsonaro, agg.totalValid)
    const partial = agg.counted < agg.total
    return {
      ...country,
      y2026,
      swing: swingOf(country.y2022, y2026),
      status: 'reported',
      coverage: { counted: agg.counted, total: agg.total },
      notes: partial
        ? `TSE EA20 live (${agg.counted}/${agg.total} seções; ${agg.cities.join('; ')})`
        : `TSE EA20 live (${agg.cities.join('; ')})`,
    }
  })

  const zzCand = extractCandidates(zzAgg)
  const zzValid = parseIntPT(zzAgg.v?.vv ?? zzAgg.v?.vvc)
  const fetchedAt = new Date().toISOString()

  return {
    ...base,
    meta: {
      ...base.meta,
      updatedAt: fetchedAt,
      tseZz: {
        election: ELEICAO,
        fetchedAt,
        sectionsCounted: parseIntPT(zzAgg.s?.st),
        sectionsTotal: parseIntPT(zzAgg.s?.ts),
        sectionsPct: parsePct(zzAgg.s?.pst),
        lula: zzCand.lula,
        bolsonaro: zzCand.bolsonaro,
        totalValid: zzValid,
        url: 'https://resultados.tse.jus.br/oficial/ele2026/6257/dados/zz/zz-c0001-e006257-u.json',
      },
    },
    countries,
  }
}
