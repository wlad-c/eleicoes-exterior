import type { Lang } from '../types'

const dict = {
  brand: { en: 'eleições exterior', pt: 'eleições exterior' },
  reported: { en: 'reported', pt: 'apurados' },
  pending: { en: 'pending', pt: 'pendentes' },
  countries: { en: 'countries', pt: 'países' },
  search: { en: 'Search country…', pt: 'Buscar país…' },
  allRegions: { en: 'All regions', pt: 'Todas as regiões' },
  status: { en: 'Status', pt: 'Status' },
  statusAll: { en: 'All', pt: 'Todos' },
  statusReported: { en: 'Reported only', pt: 'Só apurados' },
  statusPending: { en: 'Pending only', pt: 'Só pendentes' },
  mapMetric: { en: 'Map color', pt: 'Cor do mapa' },
  marginSwing: { en: 'Margin swing (L−B)', pt: 'Oscilação da margem (L−B)' },
  lulaSwing: { en: 'Lula swing (pp)', pt: 'Oscilação Lula (pp)' },
  bolsonaroSwing: { en: 'Bolsonaro swing (pp)', pt: 'Oscilação Bolsonaro (pp)' },
  margin2026: { en: '2026 margin (L−B)', pt: 'Margem 2026 (L−B)' },
  lulaPct2026: { en: '2026 Lula %', pt: 'Lula % 2026' },
  sortBy: { en: 'Sort', pt: 'Ordenar' },
  votes2026: { en: '2026 votes', pt: 'Votos 2026' },
  votes2022: { en: '2022 votes', pt: 'Votos 2022' },
  country: { en: 'Country', pt: 'País' },
  region: { en: 'Region', pt: 'Região' },
  runningTotal: { en: 'Running total (reported)', pt: 'Total parcial (apurados)' },
  lula: { en: 'Lula', pt: 'Lula' },
  fBolsonaro: { en: 'F Bolsonaro', pt: 'F Bolsonaro' },
  jBolsonaro: { en: 'J Bolsonaro', pt: 'J Bolsonaro' },
  validVotes: { en: 'valid votes', pt: 'votos válidos' },
  table: { en: 'Results table', pt: 'Tabela de resultados' },
  map: { en: 'Swing map', pt: 'Mapa de oscilação' },
  noMatch: { en: 'No countries match these filters.', pt: 'Nenhum país com esses filtros.' },
  pendingHint: { en: '2026 tally pending', pt: 'Apuração 2026 pendente' },
  notes: { en: 'Notes', pt: 'Notas' },
  sources: { en: 'Sources', pt: 'Fontes' },
  updated: { en: 'Updated', pt: 'Atualizado' },
  legendLula: { en: 'toward Lula', pt: 'para Lula' },
  legendBolso: { en: 'toward Bolsonaro', pt: 'para Bolsonaro' },
  legendPending: { en: 'pending', pt: 'pendente' },
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
