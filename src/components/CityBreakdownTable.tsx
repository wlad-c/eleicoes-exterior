import { useMemo } from 'react'
import { CountryFlag } from './CountryFlag'
import { SortableTh } from './SortableTh'
import {
  cityBolsonaroChange,
  cityLulaChange,
  citySwingToLula,
  type CityTableRow,
} from '../lib/cityRows'
import {
  cityDisplayName,
  countryName,
  fmtCoverage,
  fmtInt,
  fmtPp,
  fmtShare,
} from '../lib/format'
import { t } from '../lib/i18n'
import type { CountryResult, Lang, SortKey } from '../types'

type Props = {
  rows: CityTableRow[]
  countries: Map<string, CountryResult>
  lang: Lang
  loading?: boolean
  showCountry: boolean
  sourceNote?: string | null
  sortKey: SortKey
  sortDir: 'asc' | 'desc'
  onSort: (key: SortKey) => void
  footerNote?: string | null
}

export function CityBreakdownTable({
  rows,
  countries,
  lang,
  loading,
  showCountry,
  sourceNote,
  sortKey,
  sortDir,
  onSort,
  footerNote,
}: Props) {
  const showMunicipality = rows.some((r) => r.level === 'location')
  const nameColSpan = 1 + (showCountry ? 1 : 0) + (showMunicipality ? 1 : 0)

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
    for (const c of rows) {
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
  }, [rows])

  if (loading) {
    return (
      <p className="py-8 text-center text-[var(--ink-muted)]">
        {t('cityLoading', lang)}
      </p>
    )
  }

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-[var(--ink-muted)]">
        {t('cityEmpty', lang)}
      </p>
    )
  }

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  const singleCountry =
    !showCountry && rows[0] ? countries.get(rows[0].countryId) : null

  return (
    <div>
      {sourceNote ? (
        <p className="mb-2 text-xs text-[var(--ink-muted)]">{sourceNote}</p>
      ) : null}
      <div className="table-x-scroll">
        <table className="results-table results-table--cities text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] text-xs uppercase tracking-wide text-[var(--ink-muted)]">
              <SortableTh align="right">
                {t('rank', lang)}
              </SortableTh>
              <SortableTh
                onClick={() => onSort('city')}
                hint={t('hintCountry', lang)}
              >
                {t('city', lang)}
                {arrow('city')}
              </SortableTh>
              {showCountry ? (
                <SortableTh
                  onClick={() => onSort('country')}
                  hint={t('hintCountry', lang)}
                >
                  {t('country', lang)}
                  {arrow('country')}
                </SortableTh>
              ) : null}
              {showMunicipality ? (
                <SortableTh hint={t('hintMunicipality', lang)}>
                  {t('municipality', lang)}
                </SortableTh>
              ) : null}
              <SortableTh
                align="right"
                hint={t('hintVotes2026', lang)}
                onClick={() => onSort('votes2026')}
              >
                {t('votes2026', lang)}
                {arrow('votes2026')}
              </SortableTh>
              <SortableTh
                align="right"
                hint={t('hintShare2026', lang)}
                onClick={() => onSort('lulaPct2026')}
              >
                {t('lula', lang)} 2026{arrow('lulaPct2026')}
              </SortableTh>
              <SortableTh
                align="right"
                hint={t('hintShare2026', lang)}
                onClick={() => onSort('bolsonaroPct2026')}
              >
                {t('fBolsonaro', lang)} 2026{arrow('bolsonaroPct2026')}
              </SortableTh>
              <SortableTh
                align="right"
                hint={t('hintShare2022', lang)}
                onClick={() => onSort('votes2022')}
              >
                {t('lula', lang)} 2022{arrow('votes2022')}
              </SortableTh>
              <SortableTh align="right" hint={t('hintShare2022', lang)}>
                {t('jBolsonaro', lang)} 2022
              </SortableTh>
              <SortableTh
                align="right"
                hint={t('hintLulaChange', lang)}
                onClick={() => onSort('lulaChange')}
              >
                {t('lulaChange', lang)}
                {arrow('lulaChange')}
              </SortableTh>
              <SortableTh
                align="right"
                hint={t('hintBolsonaroChange', lang)}
                onClick={() => onSort('bolsonaroChange')}
              >
                {t('bolsonaroChange', lang)}
                {arrow('bolsonaroChange')}
              </SortableTh>
              <SortableTh
                align="right"
                hint={t('hintSwingToLula', lang)}
                onClick={() => onSort('swingToLula')}
              >
                {t('swingToLula', lang)}
                {arrow('swingToLula')}
              </SortableTh>
              <SortableTh align="right" hint={t('hintSections', lang)}>
                {t('notes', lang)}
              </SortableTh>
            </tr>
          </thead>
          <tbody>
            {rows.map((c, index) => {
              const parent = countries.get(c.countryId)
              return (
                <tr
                  key={`${c.countryId}-${c.code}`}
                  className="border-b border-[var(--line-soft)] hover:bg-[var(--chip-soft)]"
                >
                  <td className="px-2 py-2.5 text-right tabular-nums text-[var(--ink-muted)]">
                    {index + 1}
                  </td>
                  <td
                    className="cell-truncate cell-truncate-lg px-2 py-2.5 font-medium text-[var(--ink)]"
                    title={cityDisplayName(c.name)}
                  >
                    {cityDisplayName(c.name)}
                  </td>
                  {showCountry ? (
                    <td className="cell-truncate cell-truncate-lg px-2 py-2.5 text-[var(--ink)]">
                      <span className="country-flag-label">
                        {parent ? (
                          <CountryFlag
                            iso3={parent.iso3}
                            title={countryName(parent, lang)}
                          />
                        ) : null}
                        <span
                          className="cell-truncate-text"
                          title={
                            parent ? countryName(parent, lang) : c.countryId
                          }
                        >
                          {parent ? countryName(parent, lang) : c.countryId}
                        </span>
                      </span>
                    </td>
                  ) : null}
                  {showMunicipality ? (
                    <td
                      className="cell-truncate px-2 py-2.5 text-[var(--ink-muted)]"
                      title={
                        c.level === 'location' && c.municipality
                          ? cityDisplayName(c.municipality)
                          : undefined
                      }
                    >
                      {c.level === 'location' && c.municipality
                        ? cityDisplayName(c.municipality)
                        : '—'}
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
                    {fmtPp(cityLulaChange(c), lang)}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">
                    {fmtPp(cityBolsonaroChange(c), lang)}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">
                    {fmtPp(citySwingToLula(c), lang)}
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
              <td className="px-2 py-2.5 text-[var(--ink)]" colSpan={nameColSpan}>
                {t('tableTotal', lang)}
                <span className="ml-2 font-normal text-[var(--ink-muted)]">
                  {rows.length} {t('cities', lang)}
                  {singleCountry
                    ? ` · ${countryName(singleCountry, lang)}`
                    : null}
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
        {footerNote ?? t('cityNo2022Footnote', lang)}
      </p>
    </div>
  )
}

