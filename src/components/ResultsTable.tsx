import { colorForMetric } from '../lib/colors'
import { countryName, fmtInt, fmtPct, fmtPp } from '../lib/format'
import { regionLabel, t } from '../lib/i18n'
import type { CountryResult, Lang, MapMetric, SortKey } from '../types'

type Props = {
  rows: CountryResult[]
  lang: Lang
  sortKey: SortKey
  sortDir: 'asc' | 'desc'
  onSort: (key: SortKey) => void
  highlightId: string | null
  onSelect: (id: string) => void
  metric: MapMetric
}

export function ResultsTable({
  rows,
  lang,
  sortKey,
  sortDir,
  onSort,
  highlightId,
  onSelect,
  metric,
}: Props) {
  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-[var(--ink-muted)]">{t('noMatch', lang)}</p>
    )
  }

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  return (
    <div className="table-scroll overflow-x-auto">
      <table className="w-full min-w-[920px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--line)] text-xs uppercase tracking-wide text-[var(--ink-muted)]">
            <Th onClick={() => onSort('country')}>
              {t('country', lang)}
              {arrow('country')}
            </Th>
            <Th onClick={() => onSort('region')}>
              {t('region', lang)}
              {arrow('region')}
            </Th>
            <Th onClick={() => onSort('votes2026')} align="right">
              {t('lula', lang)} 2026{arrow('votes2026')}
            </Th>
            <Th align="right">{t('fBolsonaro', lang)} 2026</Th>
            <Th onClick={() => onSort('lulaPct2026')} align="right">
              Lula %{arrow('lulaPct2026')}
            </Th>
            <Th onClick={() => onSort('bolsonaroPct2026')} align="right">
              F.B. %{arrow('bolsonaroPct2026')}
            </Th>
            <Th align="right">{t('lula', lang)} 2022</Th>
            <Th align="right">{t('jBolsonaro', lang)} 2022</Th>
            <Th onClick={() => onSort('marginSwing')} align="right">
              {t('marginSwing', lang)}
              {arrow('marginSwing')}
            </Th>
            <th className="px-2 py-2 font-medium">{t('notes', lang)}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const hi = highlightId === c.id
            const swing = c.swing?.marginPp ?? null
            const heat =
              c.status === 'reported' && swing != null
                ? colorForMetric(metric === 'lulaPct2026' ? 'marginSwing' : metric, metricValueForHeat(c, metric))
                : 'transparent'
            return (
              <tr
                key={c.id}
                id={`row-${c.id}`}
                onClick={() => onSelect(c.id)}
                className={`cursor-pointer border-b border-[var(--line-soft)] transition-colors ${
                  hi ? 'bg-[var(--chip)]' : 'hover:bg-[var(--chip-soft)]'
                }`}
              >
                <td className="px-2 py-2.5 font-medium text-[var(--ink)]">
                  {countryName(c, lang)}
                </td>
                <td className="px-2 py-2.5 text-[var(--ink-muted)]">
                  {regionLabel(c.region, lang)}
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums">
                  {fmtInt(c.y2026?.lula, lang)}
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums">
                  {fmtInt(c.y2026?.bolsonaro, lang)}
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums">
                  {fmtPct(c.y2026?.lulaPct, lang)}
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums">
                  {fmtPct(c.y2026?.bolsonaroPct, lang)}
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums text-[var(--ink-muted)]">
                  {fmtInt(c.y2022.lula, lang)}
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums text-[var(--ink-muted)]">
                  {fmtInt(c.y2022.bolsonaro, lang)}
                </td>
                <td
                  className="px-2 py-2.5 text-right tabular-nums font-medium"
                  style={{ background: heat === 'transparent' ? undefined : heat + '33' }}
                >
                  {fmtPp(swing, lang)}
                </td>
                <td className="px-2 py-2.5 text-[var(--ink-muted)]">
                  {c.status === 'pending' ? t('pendingHint', lang) : c.notes || '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function metricValueForHeat(c: CountryResult, metric: MapMetric): number | null {
  if (!c.y2026 || !c.swing) return null
  switch (metric) {
    case 'marginSwing':
      return c.swing.marginPp
    case 'lulaSwing':
      return c.swing.lulaPp
    case 'bolsonaroSwing':
      return c.swing.bolsonaroPp
    case 'margin2026':
      return c.y2026.lulaPct - c.y2026.bolsonaroPct
    case 'lulaPct2026':
      return c.y2026.lulaPct
  }
}

function Th({
  children,
  onClick,
  align = 'left',
}: {
  children: React.ReactNode
  onClick?: () => void
  align?: 'left' | 'right'
}) {
  return (
    <th
      className={`px-2 py-2 font-medium ${align === 'right' ? 'text-right' : 'text-left'} ${
        onClick ? 'cursor-pointer select-none hover:text-[var(--ink)]' : ''
      }`}
      onClick={onClick}
    >
      {children}
    </th>
  )
}
