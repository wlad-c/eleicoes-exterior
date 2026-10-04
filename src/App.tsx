import { useEffect, useMemo, useRef, useState } from 'react'
import raw from './data/results.json'
import { ResultsTable } from './components/ResultsTable'
import { WorldMap } from './components/WorldMap'
import { countryName, fmtInt, fmtPct, fmtPp, aggregateRows, runningTotals } from './lib/format'
import { regionLabel, t } from './lib/i18n'
import { useTheme } from './lib/theme'
import { useResultsData } from './lib/useResultsData'
import type {
  CountryResult,
  Lang,
  MapMetric,
  ResultsData,
  SortKey,
} from './types'
import { HEATMAP_METRICS } from './types'

const seed = raw as ResultsData

const LANG_KEY = 'eleicoes-exterior-lang'

function readStoredLang(): Lang {
  try {
    const stored = localStorage.getItem(LANG_KEY)
    if (stored === 'en' || stored === 'pt') return stored
  } catch {
    /* ignore */
  }
  return 'pt'
}

export default function App() {
  const { theme, setTheme } = useTheme()
  const data = useResultsData(seed)
  const [lang, setLangState] = useState<Lang>(() =>
    typeof window === 'undefined' ? 'pt' : readStoredLang(),
  )
  const setLang = (next: Lang) => {
    setLangState(next)
    try {
      localStorage.setItem(LANG_KEY, next)
    } catch {
      /* ignore */
    }
  }
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState('all')
  const [statusFilter, setStatusFilter] = useState<'reported' | 'all' | 'pending'>(
    'reported',
  )
  const [metric, setMetric] = useState<MapMetric>('leader2026')
  const [sortKey, setSortKey] = useState<SortKey>('swingToLula')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const tableChromeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en'
  }, [lang])

  useEffect(() => {
    const el = tableChromeRef.current
    if (!el) return
    const syncHeadOffset = () => {
      document.documentElement.style.setProperty(
        '--sticky-table-head-top',
        `${Math.ceil(el.getBoundingClientRect().height)}px`,
      )
    }
    syncHeadOffset()
    const ro = new ResizeObserver(syncHeadOffset)
    ro.observe(el)
    window.addEventListener('resize', syncHeadOffset)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', syncHeadOffset)
    }
  }, [])

  const regions = useMemo(
    () => [...new Set(data.countries.map((c) => c.region))].sort(),
    [data.countries],
  )

  const totals = useMemo(() => runningTotals(data.countries), [data.countries])
  const reportedCountries = useMemo(
    () => data.countries.filter((c) => c.status === 'reported'),
    [data.countries],
  )
  const reportedAgg = useMemo(
    () => aggregateRows(reportedCountries),
    [reportedCountries],
  )
  const reportedCount = reportedCountries.length

  const mapCountries = reportedCountries

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.countries.filter((c) => {
      if (statusFilter === 'reported' && c.status !== 'reported') return false
      if (statusFilter === 'pending' && c.status !== 'pending') return false
      if (region !== 'all' && c.region !== region) return false
      if (!q) return true
      return (
        c.countryEn.toLowerCase().includes(q) ||
        c.countryPt.toLowerCase().includes(q) ||
        c.iso3.toLowerCase().includes(q)
      )
    })
  }, [data.countries, query, region, statusFilter])

  const sorted = useMemo(() => {
    const rows = [...filtered]
    const dir = sortDir === 'asc' ? 1 : -1
    rows.sort((a, b) => compare(a, b, sortKey, lang) * dir)
    return rows
  }, [filtered, sortKey, sortDir, lang])

  function onSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'country' || key === 'region' ? 'asc' : 'desc')
    }
  }

  function onSelect(id: string | null) {
    setHighlightId(id)
    if (id) {
      document.getElementById(`row-${id}`)?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      })
    }
  }

  // Drop highlight if the selected country is hidden again
  const highlightVisible =
    !highlightId ||
    mapCountries.some((c) => c.id === highlightId) ||
    filtered.some((c) => c.id === highlightId)
  const activeHighlight = highlightVisible ? highlightId : null

  const lulaShare = totals.valid ? (totals.lula / totals.valid) * 100 : 0
  const bolsoShare = totals.valid ? (totals.bolsonaro / totals.valid) * 100 : 0
  const updated = new Date(data.meta.updatedAt).toLocaleString(
    lang === 'pt' ? 'pt-BR' : 'en-GB',
    { dateStyle: 'medium', timeStyle: 'short' },
  )

  return (
    <div className="mx-auto max-w-6xl px-4 pb-[45vh] pt-6 sm:px-6">
      <header className="animate-rise mb-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="brand text-3xl font-extrabold text-[var(--ink)] sm:text-4xl">
            {t('brand', lang)}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex gap-1"
              role="group"
              aria-label={t('themeToggle', lang)}
            >
              <button
                type="button"
                className="theme-btn control px-3 py-1.5 text-sm font-semibold"
                aria-pressed={theme === 'light'}
                aria-label={t('themeLight', lang)}
                title={t('themeLight', lang)}
                onClick={() => setTheme('light')}
              >
                {t('themeLight', lang)}
              </button>
              <button
                type="button"
                className="theme-btn control px-3 py-1.5 text-sm font-semibold"
                aria-pressed={theme === 'dark'}
                aria-label={t('themeDark', lang)}
                title={t('themeDark', lang)}
                onClick={() => setTheme('dark')}
              >
                {t('themeDark', lang)}
              </button>
            </div>
            <div className="flex gap-1">
              {(['en', 'pt'] as Lang[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  className="lang-btn control px-3 py-1.5 text-sm font-semibold uppercase"
                  aria-pressed={lang === l}
                  onClick={() => setLang(l)}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
        <h1 className="max-w-3xl text-xl font-semibold leading-snug text-[var(--ink)] sm:text-2xl">
          {data.meta.title[lang]}
        </h1>
        <p className="mt-2 max-w-2xl text-[var(--ink-muted)]">{data.meta.subtitle[lang]}</p>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">{t('scope', lang)}</p>
      </header>

      <section className="panel animate-rise-delay mb-6 rounded-xl p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
              {t('runningTotal', lang)}
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              {totals.reported}/{data.countries.length} {t('countries', lang)} ·{' '}
              {fmtInt(totals.valid, lang)} {t('validVotes', lang)}
            </p>
          </div>
          <p className="text-xs text-[var(--ink-muted)]">
            {t('updated', lang)}: {updated}
            <span className="mx-1.5 text-[var(--line)]" aria-hidden>
              ·
            </span>
            {t('autoRefresh', lang)}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <TotalCard
            label={t('lula', lang)}
            votes={totals.lula}
            pct={lulaShare}
            tone="lula"
            lang={lang}
          />
          <TotalCard
            label={t('fBolsonaro', lang)}
            votes={totals.bolsonaro}
            pct={bolsoShare}
            tone="bolso"
            lang={lang}
          />
          <SwingCard swing={reportedAgg.swingToLula} lang={lang} />
        </div>
      </section>

      <section className="panel mb-6 rounded-xl p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="brand text-lg font-bold">{t('map', lang)}</h2>
            <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
              {reportedCount} {t('reported', lang)}
            </p>
          </div>
          <label className="block min-w-[220px] text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            {t('mapMetric', lang)}
            <select
              className="control mt-1 w-full"
              value={metric}
              onChange={(e) => setMetric(e.target.value as MapMetric)}
              aria-describedby="heatmap-hint"
            >
              {HEATMAP_METRICS.map((m) => (
                <option key={m} value={m}>
                  {t(m, lang)}
                </option>
              ))}
            </select>
            <span
              id="heatmap-hint"
              className="mt-1 block font-normal normal-case tracking-normal"
            >
              {t('heatmapHint', lang)}
            </span>
          </label>
        </div>
        <WorldMap
          countries={mapCountries}
          metric={metric}
          lang={lang}
          highlightId={activeHighlight}
          onSelect={onSelect}
        />
      </section>

      <section className="panel panel-results mb-4 rounded-xl p-4 sm:p-5">
        <div
          ref={tableChromeRef}
          className="sticky-table-chrome sticky top-0 z-30 -mx-4 mb-3 space-y-3 border-b border-[var(--line)] px-4 pb-3 sm:-mx-5 sm:px-5"
        >
          <div className="filter-row">
            <label className="filter-field filter-search text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
              {t('search', lang)}
              <input
                className="control mt-1 w-full min-w-0"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('search', lang)}
              />
            </label>
            <label className="filter-field filter-region text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
              {t('region', lang)}
              <select
                className="control mt-1 w-full min-w-0"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              >
                <option value="all">{t('allRegions', lang)}</option>
                {regions.map((r) => (
                  <option key={r} value={r}>
                    {regionLabel(r, lang)}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field filter-pending text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
              {t('status', lang)}
              <select
                className="control mt-1 w-full min-w-0"
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as 'reported' | 'all' | 'pending')
                }
              >
                <option value="reported">{t('statusReported', lang)}</option>
                <option value="all">{t('statusAll', lang)}</option>
                <option value="pending">{t('statusPending', lang)}</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="brand text-lg font-bold">{t('table', lang)}</h2>
            <label className="flex items-center gap-2 text-sm text-[var(--ink-muted)]">
              {t('sortBy', lang)}
              <select
                className="control"
                value={sortKey}
                onChange={(e) => {
                  const key = e.target.value as SortKey
                  setSortKey(key)
                  setSortDir(
                    key === 'country' || key === 'region' ? 'asc' : 'desc',
                  )
                }}
              >
                <option value="votes2026">{t('votes2026', lang)}</option>
                <option value="votes2022">{t('votes2022', lang)}</option>
                <option value="lulaPct2026">{t('lulaPct2026', lang)}</option>
                <option value="bolsonaroPct2026">{t('bolsonaroPct2026', lang)}</option>
                <option value="lulaChange">{t('lulaChange', lang)}</option>
                <option value="bolsonaroChange">{t('bolsonaroChange', lang)}</option>
                <option value="swingToLula">{t('swingToLula', lang)}</option>
                <option value="country">{t('country', lang)}</option>
                <option value="region">{t('region', lang)}</option>
              </select>
            </label>
          </div>
        </div>

        <ResultsTable
          rows={sorted}
          allCountries={data.countries}
          lang={lang}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={onSort}
          highlightId={activeHighlight}
          onSelect={(id) => onSelect(id)}
          metric={metric}
        />
      </section>

      <footer className="mt-10 space-y-6 border-t border-[var(--line)] pt-6 text-sm text-[var(--ink-muted)]">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--ink)]">
            {t('disclaimers', lang)}
          </h2>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>{t('disclaimerUnofficial', lang)}</li>
            <li>{t('disclaimerBu', lang)}</li>
            <li>{t('disclaimerCompare', lang)}</li>
            <li>{t('disclaimerScope', lang)}</li>
          </ul>
        </div>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--ink)]">
            {t('sources', lang)}
          </h2>
          <ul className="mt-2 space-y-2">
            {data.meta.sources.map((s) => (
              <li key={s.url} className="leading-snug">
                <a
                  className="font-medium text-[var(--ink)] underline decoration-[var(--line)] underline-offset-2 hover:decoration-[var(--accent)]"
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {s.name}
                </a>
                {s.role ? (
                  <span className="text-xs"> — {s.role[lang]}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs">
          {t('updated', lang)}: {updated}. {t('howToEdit', lang)}
        </p>

        {activeHighlight && (
          <p className="text-xs">
            → {countryName(data.countries.find((c) => c.id === activeHighlight)!, lang)}
          </p>
        )}
      </footer>
    </div>
  )
}

function TotalCard({
  label,
  votes,
  pct,
  tone,
  lang,
}: {
  label: string
  votes: number
  pct: number
  tone: 'lula' | 'bolso'
  lang: Lang
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold">{label}</span>
        <span className="tabular-nums text-lg font-bold">{fmtInt(votes, lang)}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-sm bg-[var(--paper-deep)]">
        <div
          className={`bar-fill h-full ${tone === 'lula' ? 'bar-lula' : 'bar-bolso'}`}
          style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
        />
      </div>
      <p className="mt-1 text-xs tabular-nums text-[var(--ink-muted)]">{fmtPct(pct, lang)}</p>
    </div>
  )
}

function SwingCard({
  swing,
  lang,
}: {
  swing: number | null
  lang: Lang
}) {
  const towardLula = (swing ?? 0) >= 0
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold">{t('swingToLula', lang)}</span>
        <span
          className={`tabular-nums text-lg font-bold ${
            towardLula ? 'text-[var(--lula)]' : 'text-[var(--bolso)]'
          }`}
        >
          {fmtPp(swing, lang)}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-sm bg-[var(--paper-deep)]">
        <div
          className={`bar-fill h-full ${towardLula ? 'bar-lula' : 'bar-bolso'}`}
          style={{
            width: `${Math.max(2, Math.min(100, Math.abs(swing ?? 0) * 8))}%`,
          }}
        />
      </div>
      <p className="mt-1 text-xs text-[var(--ink-muted)]">
        {t('hintSwingToLula', lang)}
      </p>
    </div>
  )
}

function compare(a: CountryResult, b: CountryResult, key: SortKey, lang: Lang): number {
  const av = sortValue(a, key, lang)
  const bv = sortValue(b, key, lang)
  if (typeof av === 'string' && typeof bv === 'string') {
    const locale = lang === 'pt' ? 'pt' : 'en'
    return av.localeCompare(bv, locale, { sensitivity: 'base' })
  }
  const an = av as number
  const bn = bv as number
  if (Number.isNaN(an) && Number.isNaN(bn)) {
    // Stable tie-break by country name when metric is missing
    return countryName(a, lang).localeCompare(countryName(b, lang), lang === 'pt' ? 'pt' : 'en', {
      sensitivity: 'base',
    })
  }
  if (Number.isNaN(an)) return 1
  if (Number.isNaN(bn)) return -1
  if (an === bn) {
    return countryName(a, lang).localeCompare(countryName(b, lang), lang === 'pt' ? 'pt' : 'en', {
      sensitivity: 'base',
    })
  }
  return an - bn
}

function sortValue(c: CountryResult, key: SortKey, lang: Lang): number | string {
  switch (key) {
    case 'country':
      return countryName(c, lang)
    case 'region':
      return c.region
    case 'votes2026':
      return c.y2026?.totalValid ?? -1
    case 'votes2022':
      return c.y2022.totalValid
    case 'lulaPct2026':
      return c.y2026?.lulaPct ?? Number.NaN
    case 'bolsonaroPct2026':
      return c.y2026?.bolsonaroPct ?? Number.NaN
    case 'lulaChange':
      return c.swing?.lulaPp ?? Number.NaN
    case 'bolsonaroChange':
      return c.swing?.bolsonaroPp ?? Number.NaN
    case 'swingToLula':
      return c.swing != null
        ? c.swing.lulaPp - c.swing.bolsonaroPp
        : Number.NaN
  }
}
