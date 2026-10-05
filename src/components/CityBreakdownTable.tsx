import { useMemo } from 'react'
import {
  cityDisplayName,
  countryName,
  fmtCoverage,
  fmtInt,
  fmtPp,
  fmtShare,
} from '../lib/format'
import { t } from '../lib/i18n'
import type { CityResult, CountryResult, Lang } from '../types'

type Props = {
  country: CountryResult | null
  rows: CityResult[]
  lang: Lang
  loading?: boolean
  /** When true, rows are voting cities (Melbourne…); else TSE municipalities. */
  isLocationLevel?: boolean
  sourceNote?: string | null
}

export function CityBreakdownTable({
  country,
  rows,
  lang,
  loading,
  isLocationLevel,
  sourceNote,
}: Props) {
  const sorted = useMemo(
    () => [...rows].sort((a, b) => b.y2026.totalValid - a.y2026.totalValid),
    [rows],
  )

  const totals = useMemo(() => {
    let lula = 0
    let bolsonaro = 0
    let valid = 0
    let lula2022 = 0
    let bolso2022 = 0
    let valid2022 = 0
    let has2022 = false
    let counted = 0
    let total = 0
    for (const c of sorted) {
      lula += c.y2026.lula
      bolsonaro += c.y2026.bolsonaro
      valid += c.y2026.totalValid
      counted += c.coverage?.counted ?? 0
      total += c.coverage?.total ?? 0
      if (c.y2022) {
        has2022 = true
        lula2022 += c.y2022.lula
        bolso2022 += c.y2022.bolsonaro
        valid2022 += c.y2022.totalValid
      }
    }
    const lulaPct = valid ? (lula / valid) * 100 : null
    const bolsoPct = valid ? (bolsonaro / valid) * 100 : null
    const lulaPct2022 = has2022 && valid2022 ? (lula2022 / valid2022) * 100 : null
    const bolsoPct2022 =
      has2022 && valid2022 ? (bolso2022 / valid2022) * 100 : null
    const lulaChange =
      lulaPct != null && lulaPct2022 != null ? lulaPct - lulaPct2022 : null
    const bolsonaroChange =
      bolsoPct != null && bolsoPct2022 != null ? bolsoPct - bolsoPct2022 : null
    const swingToLula =
      lulaChange != null && bolsonaroChange != null
        ? lulaChange - bolsonaroChange
        : null
    return {
      lula,
      bolsonaro,
      valid,
      lulaPct,
      bolsoPct,
      lula2022,
      bolso2022,
      lulaPct2022,
      bolsoPct2022,
      lulaChange,
      bolsonaroChange,
      swingToLula,
      coverage: total > 0 ? { counted, total } : null,
    }
  }, [sorted])

  if (!country) {
    return (
      <p className="py-8 text-center text-[var(--ink-muted)]">
        {t('selectCountryPlaceholder', lang)}
      </p>
    )
  }

  if (loading) {
    return (
      <p className="py-8 text-center text-[var(--ink-muted)]">
        {t('cityLoading', lang)}
      </p>
    )
  }

  if (sorted.length === 0) {
    return (
      <p className="py-8 text-center text-[var(--ink-muted)]">
        {t('cityEmpty', lang)}
      </p>
    )
  }

  return (
    <div>
      {isLocationLevel && sourceNote ? (
        <p className="mb-2 text-xs text-[var(--ink-muted)]">{sourceNote}</p>
      ) : null}
      <div className="table-x-scroll">
        <table className="results-table w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] text-xs uppercase tracking-wide text-[var(--ink-muted)]">
              <Th align="right">{t('rank', lang)}</Th>
              <Th hint={isLocationLevel ? t('hintLocation', lang) : t('hintCity', lang)}>
                {isLocationLevel ? t('location', lang) : t('city', lang)}
              </Th>
              {isLocationLevel ? (
                <Th hint={t('hintMunicipality', lang)}>{t('municipality', lang)}</Th>
              ) : null}
              <Th align="right" hint={t('hintVotes2026', lang)}>
                {t('votes2026', lang)}
              </Th>
              <Th align="right" hint={t('hintShare2026', lang)}>
                {t('lula', lang)} 2026
              </Th>
              <Th align="right" hint={t('hintShare2026', lang)}>
                {t('fBolsonaro', lang)} 2026
              </Th>
              <Th align="right" hint={t('hintShare2022', lang)}>
                {t('lula', lang)} 2022
              </Th>
              <Th align="right" hint={t('hintShare2022', lang)}>
                {t('jBolsonaro', lang)} 2022
              </Th>
              <Th align="right" hint={t('hintLulaChange', lang)}>
                {t('lulaChange', lang)}
              </Th>
              <Th align="right" hint={t('hintBolsonaroChange', lang)}>
                {t('bolsonaroChange', lang)}
              </Th>
              <Th align="right" hint={t('hintSwingToLula', lang)}>
                {t('swingToLula', lang)}
              </Th>
              <Th align="right" hint={t('hintSections', lang)}>
                {t('notes', lang)}
              </Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c, index) => {
              const swing =
                c.swing != null
                  ? c.swing.lulaPp - c.swing.bolsonaroPp
                  : c.y2022 && c.y2026
                    ? c.y2026.lulaPct -
                      c.y2022.lulaPct -
                      (c.y2026.bolsonaroPct - c.y2022.bolsonaroPct)
                    : null
              return (
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
                  {isLocationLevel ? (
                    <td className="px-2 py-2.5 text-[var(--ink-muted)]">
                      {c.municipality ? cityDisplayName(c.municipality) : '—'}
                    </td>
                  ) : null}
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
                    {fmtShare(c.y2022?.lulaPct, c.y2022?.lula, lang)}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-[var(--ink-muted)]">
                    {fmtShare(c.y2022?.bolsonaroPct, c.y2022?.bolsonaro, lang)}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">
                    {fmtPp(
                      c.swing?.lulaPp ??
                        (c.y2022 && c.y2026
                          ? c.y2026.lulaPct - c.y2022.lulaPct
                          : null),
                      lang,
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">
                    {fmtPp(
                      c.swing?.bolsonaroPp ??
                        (c.y2022 && c.y2026
                          ? c.y2026.bolsonaroPct - c.y2022.bolsonaroPct
                          : null),
                      lang,
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">
                    {fmtPp(swing, lang)}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-[var(--ink-muted)]">
                    {fmtCoverage(c.coverage)}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--line)] text-sm font-semibold">
              <td className="px-2 py-2.5 text-right tabular-nums text-[var(--ink-muted)]">
                —
              </td>
              <td className="px-2 py-2.5 text-[var(--ink)]" colSpan={isLocationLevel ? 2 : 1}>
                {t('tableTotal', lang)}
                <span className="ml-2 font-normal text-[var(--ink-muted)]">
                  {sorted.length}{' '}
                  {isLocationLevel ? t('locations', lang) : t('cities', lang)} ·{' '}
                  {countryName(country, lang)}
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
                {fmtShare(totals.lulaPct2022, totals.lula2022, lang)}
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums text-[var(--ink-muted)]">
                {fmtShare(totals.bolsoPct2022, totals.bolso2022, lang)}
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums">
                {fmtPp(totals.lulaChange, lang)}
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums">
                {fmtPp(totals.bolsonaroChange, lang)}
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums">
                {fmtPp(totals.swingToLula, lang)}
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums text-[var(--ink-muted)]">
                {fmtCoverage(totals.coverage)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-2 px-1 text-xs text-[var(--ink-muted)]">
        {t('cityNo2022Footnote', lang)}
      </p>
    </div>
  )
}

function Th({
  children,
  hint,
  align = 'left',
}: {
  children: React.ReactNode
  hint?: string
  align?: 'left' | 'right'
}) {
  return (
    <th
      className={`px-2 py-2.5 font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      <span className="block text-[11px] font-semibold uppercase tracking-wide">
        {children}
      </span>
      {hint ? (
        <span className="th-hint mt-0.5 block text-[10px] font-normal normal-case tracking-normal text-[var(--ink-muted)] opacity-90">
          {hint}
        </span>
      ) : null}
    </th>
  )
}
