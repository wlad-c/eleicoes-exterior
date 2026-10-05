import type { Lang } from '../types'

const dict = {
  brand: { en: 'eleições exterior', pt: 'eleições exterior' },
  reported: { en: 'reported', pt: 'apurados' },
  pending: { en: 'pending', pt: 'pendentes' },
  countries: { en: 'countries', pt: 'países' },
  search: { en: 'Search country…', pt: 'Buscar país…' },
  allRegions: { en: 'All regions', pt: 'Todas as regiões' },
  status: { en: 'Status', pt: 'Status' },
  statusAll: { en: 'All countries', pt: 'Todos os países' },
  statusReported: { en: 'Reported only', pt: 'Só apurados' },
  statusPending: { en: 'Pending only', pt: 'Só pendentes' },
  mapMetric: { en: 'Heatmap metric', pt: 'Métrica do mapa de calor' },
  lulaChange: { en: 'Lula change', pt: 'Variação Lula' },
  bolsonaroChange: { en: 'Bolsonaro change', pt: 'Variação Bolsonaro' },
  swingToLula: { en: 'Swing to Lula', pt: 'Swing para Lula' },
  leader2026: {
    en: '2026 leader (who has more votes)',
    pt: 'Líder 2026 (quem tem mais votos)',
  },
  leader2022: {
    en: '2022 leader (who has more votes)',
    pt: 'Líder 2022 (quem tem mais votos)',
  },
  lulaPct2026: { en: '2026 Lula %', pt: 'Lula % 2026' },
  bolsonaroPct2026: { en: '2026 F Bolsonaro %', pt: 'F Bolsonaro % 2026' },
  lulaPct2022: { en: '2022 Lula %', pt: 'Lula % 2022' },
  bolsonaroPct2022: { en: '2022 J Bolsonaro %', pt: 'J Bolsonaro % 2022' },
  votes2026: { en: '2026 valid votes', pt: 'Votos válidos 2026' },
  votes2022: { en: '2022 valid votes', pt: 'Votos válidos 2022' },
  showPending: {
    en: 'Show pending countries',
    pt: 'Mostrar países pendentes',
  },
  showPendingShort: {
    en: 'Pending',
    pt: 'Pendentes',
  },
  showPendingHint: {
    en: 'Hidden by default until 2026 results are published',
    pt: 'Ocultos por padrão até a publicação dos resultados de 2026',
  },
  pendingHidden: { en: 'hidden', pt: 'ocultos' },
  heatmapHint: {
    en: 'Colors the map and the matching table column',
    pt: 'Colorize o mapa e a coluna correspondente na tabela',
  },
  legendLow: { en: 'low', pt: 'baixo' },
  legendHigh: { en: 'high', pt: 'alto' },
  sortBy: { en: 'Sort', pt: 'Ordenar' },
  rank: { en: '#', pt: '#' },
  country: { en: 'Country', pt: 'País' },
  region: { en: 'Region', pt: 'Região' },
  runningTotal: { en: 'Running total (reported)', pt: 'Total parcial (apurados)' },
  tableTotal: { en: 'Total', pt: 'Total' },
  totalFootnoteMixed: {
    en: 'Note: 2022 share columns in Total sum every filtered country. 2026 shares and change/swing use only countries with 2026 results (comparable set).',
    pt: 'Nota: as colunas de % 2022 no Total somam todos os países filtrados. As % 2026 e variação/swing usam só países com resultado 2026 (conjunto comparável).',
  },
  swingHint: {
    en: 'Same as the table Total row for countries with 2026 results',
    pt: 'Igual à linha Total da tabela para países com resultado 2026',
  },
  lula: { en: 'Lula', pt: 'Lula' },
  fBolsonaro: { en: 'F Bolsonaro', pt: 'F Bolsonaro' },
  jBolsonaro: { en: 'J Bolsonaro', pt: 'J Bolsonaro' },
  validVotes: { en: 'valid votes', pt: 'votos válidos' },
  table: { en: 'Results table', pt: 'Tabela de resultados' },
  map: { en: 'Swing map', pt: 'Mapa de oscilação' },
  noMatch: { en: 'No countries match these filters.', pt: 'Nenhum país com esses filtros.' },
  pendingHint: { en: '2026 tally pending', pt: 'Apuração 2026 pendente' },
  disputedShort: {
    en: 'Disputed 2026 tally — see notes / awaiting TSE',
    pt: 'Apuração 2026 contestada — ver notas / aguardando TSE',
  },
  notes: { en: 'Sections', pt: 'Seções' },
  hintRank: {
    en: 'by current sort / filter',
    pt: 'pela ordenação / filtro atual',
  },
  hintCountry: { en: 'name', pt: 'nome' },
  hintRegion: { en: 'world region', pt: 'região' },
  hintVotes2026: {
    en: 'total valid ballots',
    pt: 'total de votos válidos',
  },
  hintShare2026: {
    en: '% of valid (votes)',
    pt: '% dos válidos (votos)',
  },
  hintShare2022: {
    en: '% of valid (votes)',
    pt: '% dos válidos (votos)',
  },
  hintLulaChange: {
    en: 'pp vs 2022 (Δ votes)',
    pt: 'pp vs 2022 (Δ votos)',
  },
  hintBolsonaroChange: {
    en: 'pp vs 2022 (Δ votes)',
    pt: 'pp vs 2022 (Δ votos)',
  },
  hintSwingToLula: {
    en: 'Lula Δ − Bolso Δ',
    pt: 'Lula Δ − Bolso Δ',
  },
  hintSections: {
    en: 'counted / total',
    pt: 'apuradas / total',
  },
  sources: { en: 'Sources', pt: 'Fontes' },
  disclaimers: { en: 'Disclaimers', pt: 'Avisos' },
  disclaimerUnofficial: {
    en: 'This page is an unofficial compilation. It is not affiliated with the TSE, TRE-DF, any campaign, or newsroom. Official overseas results are those published by the Tribunal Superior Eleitoral.',
    pt: 'Esta página é uma compilação não oficial. Não tem vínculo com o TSE, o TRE-DF, campanhas ou redações. Os resultados oficiais no exterior são os divulgados pelo Tribunal Superior Eleitoral.',
  },
  disclaimerBu: {
    en: 'When the TSE has published overseas (ZZ) totals, those official figures are used. Where TSE data for a country is still missing, numbers may come from publicly posted ballot-box tallies (BUs) and press roundups and can change as more sections are totalized.',
    pt: 'Quando o TSE publica totais do exterior (ZZ), esses números oficiais são usados. Onde ainda faltar dado do TSE para um país, os valores podem vir de boletins de urna (BU) e levantamentos da imprensa, e mudar conforme novas seções forem totalizadas.',
  },
  disclaimerCompare: {
    en: 'Comparisons treat Flávio Bolsonaro (2026) against Jair Bolsonaro (2022) for continuity of the Bolsonaro ticket abroad. They are not the same candidate. Percentages use valid votes; swing to Lula is Lula change minus Bolsonaro change (percentage points).',
    pt: 'As comparações tratam Flávio Bolsonaro (2026) frente a Jair Bolsonaro (2022) pela continuidade da chapa Bolsonaro no exterior. Não são o mesmo candidato. Os percentuais usam votos válidos; o swing para Lula é a variação de Lula menos a de Bolsonaro (pontos percentuais).',
  },
  disclaimerScope: {
    en: 'Scope is overseas 1st-round presidential voting only. Aggregates and the map reflect only countries marked reported in this dataset, not the full ZZ electorate.',
    pt: 'O recorte é só a votação presidencial do 1º turno no exterior. Totais e o mapa refletem apenas os países marcados como apurados neste conjunto de dados, não todo o eleitorado ZZ.',
  },
  howToEdit: {
    en: 'The live page refreshes overseas tallies directly from the TSE. Optional: npm run sync:tse && npm run build:pages to refresh the committed seed JSON.',
    pt: 'A página ao vivo atualiza os totais do exterior direto do TSE. Opcional: npm run sync:tse && npm run build:pages para atualizar o JSON seed commitado.',
  },
  updated: { en: 'Updated', pt: 'Atualizado' },
  autoRefresh: {
    en: 'checks for new data on load / focus / every 30 min',
    pt: 'busca novos dados ao carregar / focar / a cada 30 min',
  },
  autoRefreshFast: {
    en: 'live TSE every 2 min',
    pt: 'TSE ao vivo a cada 2 min',
  },
  legendLula: { en: '≥ +10 pp Lula', pt: '≥ +10 pp Lula' },
  legendBolso: { en: '≤ −10 pp Bolsonaro', pt: '≤ −10 pp Bolsonaro' },
  legendLeaderLula: { en: 'Lula >50% → 100%', pt: 'Lula >50% → 100%' },
  legendLeaderBolso: {
    en: 'Bolsonaro >50% → 100%',
    pt: 'Bolsonaro >50% → 100%',
  },
  legendPending: { en: 'pending', pt: 'pendente' },
  themeLight: { en: 'Light', pt: 'Claro' },
  themeDark: { en: 'Dark', pt: 'Escuro' },
  themeToggle: { en: 'Toggle color theme', pt: 'Alternar tema de cores' },
  scope: {
    en: 'Overseas 1st round only · F Bolsonaro compared to J Bolsonaro 2022',
    pt: 'Somente exterior 1º turno · F Bolsonaro comparado a J Bolsonaro 2022',
  },
  Africa: { en: 'Africa', pt: 'África' },
  Americas: { en: 'Americas', pt: 'Américas' },
  Asia: { en: 'Asia', pt: 'Ásia' },
  Europe: { en: 'Europe', pt: 'Europa' },
  'Middle East': { en: 'Middle East', pt: 'Oriente Médio' },
  Oceania: { en: 'Oceania', pt: 'Oceania' },
} as const

export type DictKey = keyof typeof dict

export function t(key: DictKey, lang: Lang): string {
  return dict[key][lang]
}

export function regionLabel(region: string, lang: Lang): string {
  if (region in dict) return t(region as DictKey, lang)
  return region
}
