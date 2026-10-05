import { useMemo } from 'react'
import {
  cityDisplayName,
  countryName,
  fmtCoverage,
  fmtInt,
  fmtShare,
} from '../lib/format'
import { t } from '../lib/i18n'
import type { CityResult, CountryResult, Lang } from '../types'

type Props = {
  country: CountryResult | null
  lang: Lang
}

export function CityBreakdownTable({ country, lang }: Props) {
  const cities = useMemo(() => {
    if (!country?.cities?.length) return [] as CityResult[]
    return [...country.cities].sort(
      (a, b) => b.y2026.totalValid - a.y2026.totalValid,
    )
  }, [country])

  const totals = useMemo(() => {
    let lula = 0
    let bolsonaro = 0
    let valid = 0
    let counted = 0
    let total = 0
    for (const c of cities) {
      lula += c.y2026.lula
      bolsonaro += c.y2026.bolsonaro
      valid += c.y2026.totalValid
      counted += c.coverage?.counted ?? 0
      total += c.coverage?.total ?? 0
    }
    return {
      lula,
      bolsonaro,
      valid,
      lulaPct: valid ? (lula / valid) * 100 : null,
      bolsoPct: valid ? (bolsonaro / valid) * 100 : null,
      coverage: total > 0 ? { counted, total } : null,
    }
  }, [cities])

  if (!country) {
    return (
      <p className="py-8 text-center text-[var(--ink-muted)]">
        {t('selectCountryPlaceholder', lang)}
      </p>
    )
  }

  if (cities.length === 0) {
    return (
      <p className="py-8 text-center text-[var(--ink-muted)]">
        {t('cityEmpty', lang)}
      </p>
    )
  }

  return (
    <div className="table-x-scroll">
      <table className="results-table w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--line)] text-xs uppercase tracking-wide text-[var(--ink-muted)]">
            <th className="px-2 py-2.5 text-right font-medium">
              <span className="block text-[11px] font-semibold uppercase tracking-wide">
                {t('rank', lang)}
              </span>
            </th>
            <th className="px-2 py-2.5 text-left font-medium">
              <span className="block text-[11px] font-semibold uppercase tracking-wide">
                {t('city', lang)}
              </span>
              <span className="th-hint mt-0.5 block text-[10px] font-normal normal-case tracking-normal text-[var(--ink-muted)] opacity-90">
                {t('hintCity', lang)}
              </span>
            </th>
            <th className="px-2 py-2.5 text-right font-medium">
              <span className="block text-[11px] font-semibold uppercase tracking-wide">
                {t('votes2026', lang)}
              </span>
              <span className="th-hint mt-0.5 block text-[10px] font-normal normal-case tracking-normal text-[var(--ink-muted)] opacity-90">
                {t('hintVotes2026', lang)}
              </span>
            </th>
            <th className="px-2 py-2.5 text-right font-medium">
              <span className="block text-[11px] font-semibold uppercase tracking-wide">
                {t('lula', lang)} 2026
              </span>
              <span className="th-hint mt-0.5 block text-[10px] font-normal normal-case tracking-normal text-[var(--ink-muted)] opacity-90">
                {t('hintShare2026', lang)}
              </span>
            </th>
            <th className="px-2 py-2.5 text-right font-medium">
              <span className="block text-[11px] font-semibold uppercase tracking-wide">
                {t('fBolsonaro', lang)} 2026
              </span>
              <span className="th-hint mt-0.5 block text-[10px] font-normal normal-case tracking-normal text-[var(--ink-muted)] opacity-90">
                {t('hintShare2026', lang)}
              </span>
            </th>
            <th className="px-2 py-2.5 text-right font-medium">
              <span className="block text-[11px] font-semibold uppercase tracking-wide">
                {t('notes', lang)}
              </span>
              <span className="th-hint mt-0.5 block text-[10px] font-normal normal-case tracking-normal text-[var(--ink-muted)] opacity-90">
                {t('hintSections', lang)}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {cities.map((c, index) => (
            <tr
              key={c.code}
              className="border-b border-[var(--line-soft)] hover:bg-[var(--chip-soft)]"
            >
              <td className="px-2 py-2.5 text-right tabular-nums text-[var(--ink-muted)]">
                {index + 1}
              </td>
              <td className="px-2 py-2.5 font-medium text-[var(--ink)]">
                {cityDisplayName(c.name)}
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums">
                {fmtInt(c.y2026.totalValid, lang)}
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums">
                {fmtShare(c.y2026.lulaPct, c.y2026.lula, lang)}
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums">
                {fmtShare(c.y2026.bolsonaroPct, c.y2026.bolsonaro, lang)}
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums text-[var(--ink-muted)]">
                {fmtCoverage(c.coverage)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[var(--line)] text-sm font-semibold">
            <td className="px-2 py-2.5 text-right tabular-nums text-[var(--ink-muted)]">
              —
            </td>
            <td className="px-2 py-2.5 text-[var(--ink)]">
              {t('tableTotal', lang)}
              <span className="ml-2 font-normal text-[var(--ink-muted)]">
                {cities.length} {t('cities', lang)} · {countryName(country, lang)}
              </span>
            </td>
            <td className="px-2 py-2.5 text-right tabular-nums">
              {fmtInt(totals.valid, lang)}
            </td>
            <td className="px-2 py-2.5 text-right tabular-nums">
              {fmtShare(totals.lulaPct, totals.lula, lang)}
            </td>
            <td className="px-2 py-2.5 text-right tabular-nums">
              {fmtShare(totals.bolsoPct, totals.bolsonaro, lang)}
            </td>
            <td className="px-2 py-2.5 text-right tabular-nums text-[var(--ink-muted)]">
              {fmtCoverage(totals.coverage)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
