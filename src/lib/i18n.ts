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
  country: { en: 'Country', pt: 'País' },
  region: { en: 'Region', pt: 'Região' },
  runningTotal: { en: 'Running total (reported)', pt: 'Total parcial (apurados)' },
  tableTotal: { en: 'Total', pt: 'Total' },
  lula: { en: 'Lula', pt: 'Lula' },
  fBolsonaro: { en: 'F Bolsonaro', pt: 'F Bolsonaro' },
  jBolsonaro: { en: 'J Bolsonaro', pt: 'J Bolsonaro' },
  validVotes: { en: 'valid votes', pt: 'votos válidos' },
  table: { en: 'Results table', pt: 'Tabela de resultados' },
  map: { en: 'Swing map', pt: 'Mapa de oscilação' },
  noMatch: { en: 'No countries match these filters.', pt: 'Nenhum país com esses filtros.' },
  pendingHint: { en: '2026 tally pending', pt: 'Apuração 2026 pendente' },
  notes: { en: 'Sections', pt: 'Seções' },
  hintCountry: { en: 'name', pt: 'nome' },
  hintRegion: { en: 'world region', pt: 'região' },
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
  updated: { en: 'Updated', pt: 'Atualizado' },
  legendLula: { en: 'toward Lula', pt: 'para Lula' },
  legendBolso: { en: 'toward Bolsonaro', pt: 'para Bolsonaro' },
  legendPending: { en: 'pending', pt: 'pendente' },
  themeLight: { en: 'Light', pt: 'Claro' },
  themeDark: { en: 'Dark', pt: 'Escuro' },
  themeToggle: { en: 'Toggle color theme', pt: 'Alternar tema de cores' },
  howToEdit: {
    en: 'Edit src/data/results.json and rebuild to update figures.',
    pt: 'Edite src/data/results.json e faça o build para atualizar os números.',
  },
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
