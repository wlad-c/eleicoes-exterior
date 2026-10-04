import { useMemo, useState } from 'react'
import raw from './data/results.json'
import { ResultsTable } from './components/ResultsTable'
import { WorldMap } from './components/WorldMap'
import { countryName, fmtInt, fmtPct, runningTotals } from './lib/format'
import { regionLabel, t } from './lib/i18n'
import { useTheme } from './lib/theme'
import type {
  CountryResult,
  Lang,
  MapMetric,
  ResultsData,
  SortKey,
} from './types'

const data = raw as ResultsData

const METRICS: MapMetric[] = [
  'marginSwing',
  'lulaSwing',
  'bolsonaroSwing',
  'margin2026',
  'lulaPct2026',
]

export default function App() {
  const { theme, setTheme } = useTheme()
  const [lang, setLang] = useState<Lang>('en')
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState('all')
  const [status, setStatus] = useState<'all' | 'reported' | 'pending'>('all')
  const [metric, setMetric] = useState<MapMetric>('marginSwing')
  const [sortKey, setSortKey] = useState<SortKey>('votes2026')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [highlightId, setHighlightId] = useState<string | null>(null)

  const regions = useMemo(
    () => [...new Set(data.countries.map((c) => c.region))].sort(),
    [],
  )

  const totals = useMemo(() => runningTotals(data.countries), [])
  const reportedCount = data.countries.filter((c) => c.status === 'reported').length

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.countries.filter((c) => {
      if (region !== 'all' && c.region !== region) return false
      if (status !== 'all' && c.status !== status) return false
      if (!q) return true
      return (
        c.countryEn.toLowerCase().includes(q) ||
        c.countryPt.toLowerCase().includes(q) ||
        c.iso3.toLowerCase().includes(q)
      )
    })
  }, [query, region, status])

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

  const lulaShare = totals.valid ? (totals.lula / totals.valid) * 100 : 0
  const bolsoShare = totals.valid ? (totals.bolsonaro / totals.valid) * 100 : 0
  const updated = new Date(data.meta.updatedAt).toLocaleString(
    lang === 'pt' ? 'pt-BR' : 'en-GB',
    { dateStyle: 'medium', timeStyle: 'short' },
  )

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
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
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
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
        </div>
      </section>

      <section className="panel mb-6 rounded-xl p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="brand text-lg font-bold">{t('map', lang)}</h2>
          <span className="text-xs text-[var(--ink-muted)]">
            {reportedCount} {t('reported', lang)} · {data.countries.length - reportedCount}{' '}
            {t('pending', lang)}
          </span>
        </div>
        <WorldMap
          countries={data.countries}
          metric={metric}
          lang={lang}
          highlightId={highlightId}
          onSelect={onSelect}
        />
      </section>

      <section className="panel mb-4 rounded-xl p-4 sm:p-5">
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            {t('search', lang)}
            <input
              className="control mt-1 w-full"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('search', lang)}
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            {t('region', lang)}
            <select
              className="control mt-1 w-full"
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
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            {t('status', lang)}
            <select
              className="control mt-1 w-full"
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
            >
              <option value="all">{t('statusAll', lang)}</option>
              <option value="reported">{t('statusReported', lang)}</option>
              <option value="pending">{t('statusPending', lang)}</option>
            </select>
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            {t('mapMetric', lang)}
            <select
              className="control mt-1 w-full"
              value={metric}
              onChange={(e) => setMetric(e.target.value as MapMetric)}
            >
              {METRICS.map((m) => (
                <option key={m} value={m}>
                  {t(m, lang)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="brand text-lg font-bold">{t('table', lang)}</h2>
          <label className="flex items-center gap-2 text-sm text-[var(--ink-muted)]">
            {t('sortBy', lang)}
            <select
              className="control"
              value={sortKey}
              onChange={(e) => onSort(e.target.value as SortKey)}
            >
              <option value="votes2026">{t('votes2026', lang)}</option>
              <option value="votes2022">{t('votes2022', lang)}</option>
              <option value="lulaPct2026">Lula % 2026</option>
              <option value="bolsonaroPct2026">F.B. % 2026</option>
              <option value="marginSwing">{t('marginSwing', lang)}</option>
              <option value="country">{t('country', lang)}</option>
              <option value="region">{t('region', lang)}</option>
            </select>
          </label>
        </div>

        <ResultsTable
          rows={sorted}
          lang={lang}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={onSort}
          highlightId={highlightId}
          onSelect={(id) => onSelect(id)}
          metric={metric}
        />
      </section>

      <footer className="mt-8 space-y-2 text-sm text-[var(--ink-muted)]">
        <p>{t('howToEdit', lang)}</p>
        <p>
          {t('sources', lang)}:{' '}
          {data.meta.sources.map((s, i) => (
            <span key={s.url}>
              {i > 0 ? ' · ' : ''}
              <a
                className="underline decoration-[var(--line)] underline-offset-2 hover:text-[var(--ink)]"
                href={s.url}
                target="_blank"
                rel="noreferrer"
              >
                {s.name}
              </a>
            </span>
          ))}
        </p>
        {highlightId && (
          <p className="text-xs">
            → {countryName(data.countries.find((c) => c.id === highlightId)!, lang)}
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

function compare(a: CountryResult, b: CountryResult, key: SortKey, lang: Lang): number {
  const av = sortValue(a, key, lang)
  const bv = sortValue(b, key, lang)
  if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv)
  const an = av as number
  const bn = bv as number
  if (Number.isNaN(an) && Number.isNaN(bn)) return 0
  if (Number.isNaN(an)) return 1
  if (Number.isNaN(bn)) return -1
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
    case 'marginSwing':
      return c.swing?.marginPp ?? Number.NaN
  }
}
