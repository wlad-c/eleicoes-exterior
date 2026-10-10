import type { Lang } from '../types'

/**
 * UI copy (EN / PT). Naming rules:
 * - Hierarchy: Country → Area → City → Neighborhood (País → Área → Cidade → Bairro)
 * - Metrics: subject then year at the end (e.g. Lula % 2026, Votes 2026)
 * - Short labels in chrome; formulas live in hints / disclaimers
 */
const dict = {
  brand: { en: 'eleições exterior', pt: 'eleições exterior' },
  reported: { en: 'reported', pt: 'apurados' },
  pending: { en: 'pending', pt: 'pendentes' },
  countries: { en: 'countries', pt: 'países' },
  search: { en: 'Search country…', pt: 'Buscar país…' },
  searchCity: { en: 'Search city or country…', pt: 'Buscar cidade ou país…' },
  searchArea: { en: 'Search area or country…', pt: 'Buscar área ou país…' },
  searchSuburb: {
    en: 'Search neighborhood, city, or Brazil…',
    pt: 'Buscar bairro, cidade ou Brasil…',
  },
  tabCountries: { en: 'Country', pt: 'País' },
  tabAreas: { en: 'Area', pt: 'Área' },
  tabCities: { en: 'City', pt: 'Cidade' },
  tabSuburbs: { en: 'Neighborhood', pt: 'Bairro' },
  tableView: { en: 'Table', pt: 'Tabela' },
  allCountriesFilter: { en: 'Any country', pt: 'Qualquer país' },
  allAreasFilter: { en: 'Any area', pt: 'Qualquer área' },
  allCitiesFilter: { en: 'Any city', pt: 'Qualquer cidade' },
  filterCountry: { en: 'Country', pt: 'País' },
  filterArea: { en: 'Area', pt: 'Área' },
  filterCity: { en: 'City', pt: 'Cidade' },
  filterSearchCountry: {
    en: 'Search countries…',
    pt: 'Buscar países…',
  },
  filterSearchArea: {
    en: 'Search areas…',
    pt: 'Buscar áreas…',
  },
  filterSearchCity: {
    en: 'Search cities…',
    pt: 'Buscar cidades…',
  },
  filterEmpty: {
    en: 'No results',
    pt: 'Sem resultados',
  },
  filterSelected: {
    en: 'selected',
    pt: 'selecionados',
  },
  clearSearch: { en: 'Clear search', pt: 'Limpar busca' },
  includeBrazil: {
    en: 'Include Brazil',
    pt: 'Incluir Brasil',
  },
  includeBrazilHint: {
    en: 'Off by default — turn on or select Brazil on the map to show domestic rows',
    pt: 'Desligado por padrão — ligue ou selecione Brasil no mapa para ver linhas domésticas',
  },
  allRegions: {
    en: 'Any region',
    pt: 'Qualquer região',
  },
  filterGlobalRegions: {
    en: 'Region',
    pt: 'Região',
  },
  status: { en: 'Status', pt: 'Status' },
  statusAll: { en: 'All', pt: 'Todos' },
  statusReported: { en: 'Reported', pt: 'Apurados' },
  statusPending: { en: 'Pending', pt: 'Pendentes' },
  mapMetric: { en: 'Color by', pt: 'Colorir por' },
  lulaChange: { en: 'Lula change', pt: 'Variação Lula' },
  bolsonaroChange: { en: 'Bolsonaro change', pt: 'Variação Bolsonaro' },
  swing: {
    en: 'Swing',
    pt: 'Swing',
  },
  difference2026: {
    en: 'Difference 2026',
    pt: 'Diferença 2026',
  },
  difference2022: {
    en: 'Difference 2022',
    pt: 'Diferença 2022',
  },
  leader2026: {
    en: 'Leader 2026',
    pt: 'Líder 2026',
  },
  leader2022: {
    en: 'Leader 2022',
    pt: 'Líder 2022',
  },
  lulaPct2026: { en: 'Lula % 2026', pt: 'Lula % 2026' },
  bolsonaroPct2026: { en: 'F Bolsonaro % 2026', pt: 'F Bolsonaro % 2026' },
  lulaPct2022: { en: 'Lula % 2022', pt: 'Lula % 2022' },
  bolsonaroPct2022: { en: 'J Bolsonaro % 2022', pt: 'J Bolsonaro % 2022' },
  votes2026: { en: 'Votes 2026', pt: 'Votos 2026' },
  votes2022: { en: 'Votes 2022', pt: 'Votos 2022' },
  lulaVotes2026: { en: 'Lula votes 2026', pt: 'Votos Lula 2026' },
  lulaVotes2022: { en: 'Lula votes 2022', pt: 'Votos Lula 2022' },
  bolsonaroVotes2026: {
    en: 'F Bolsonaro votes 2026',
    pt: 'Votos F Bolsonaro 2026',
  },
  bolsonaroVotes2022: {
    en: 'J Bolsonaro votes 2022',
    pt: 'Votos J Bolsonaro 2022',
  },
  otherPct2026: {
    en: 'Other % 2026',
    pt: 'Outros % 2026',
  },
  otherPct2022: {
    en: 'Other % 2022',
    pt: 'Outros % 2022',
  },
  noValidVotePct2026: {
    en: 'No valid vote % 2026',
    pt: 'Sem voto válido % 2026',
  },
  noValidVotePct2022: {
    en: 'No valid vote % 2022',
    pt: 'Sem voto válido % 2022',
  },
  noValidVotes2026: {
    en: 'No valid votes 2026',
    pt: 'Sem voto válido 2026',
  },
  noValidVotes2022: {
    en: 'No valid votes 2022',
    pt: 'Sem voto válido 2022',
  },
  showPending: {
    en: 'Show pending',
    pt: 'Mostrar pendentes',
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
    pt: 'Colore o mapa e a coluna correspondente na tabela',
  },
  mapBack: {
    en: 'Broader map',
    pt: 'Mapa mais amplo',
  },
  mapLoading: {
    en: 'Loading map…',
    pt: 'Carregando mapa…',
  },
  mapTipClose: {
    en: 'Dismiss map tip',
    pt: 'Fechar dica do mapa',
  },
  mapZoomIn: { en: 'Zoom in', pt: 'Aumentar zoom' },
  mapZoomOut: { en: 'Zoom out', pt: 'Diminuir zoom' },
  mapZoomReset: { en: 'Reset zoom', pt: 'Redefinir zoom' },
  legendLow: { en: 'low', pt: 'baixo' },
  legendHigh: { en: 'high', pt: 'alto' },
  sortBy: { en: 'Sort', pt: 'Ordenar' },
  tableColumns: { en: 'Columns', pt: 'Colunas' },
  tableColumnsHint: {
    en: 'Drag ⋮⋮ (or a column header) to reorder. Same order for Country, Area, City, and Neighborhood.',
    pt: 'Arraste ⋮⋮ (ou o cabeçalho da coluna) para reordenar. A mesma ordem vale para País, Área, Cidade e Bairro.',
  },
  tableColumnsDrag: {
    en: 'Drag to reorder columns',
    pt: 'Arraste para reordenar colunas',
  },
  rank: { en: '#', pt: '#' },
  country: { en: 'Country', pt: 'País' },
  region: { en: 'Region', pt: 'Região' },
  runningTotal: {
    en: 'Overseas total (reported)',
    pt: 'Total exterior (apurados)',
  },
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
  validVotes: { en: 'votes', pt: 'votos' },
  table: { en: 'Results table', pt: 'Tabela de resultados' },
  cityTable: {
    en: 'City breakdown',
    pt: 'Detalhamento por cidade',
  },
  areaTableHint: {
    en: 'Overseas: TSE ZZ consular areas. Brazil: states (UF) and the Federal District.',
    pt: 'Exterior: áreas consulares ZZ do TSE. Brasil: estados (UF) e o Distrito Federal.',
  },
  cityTableHint: {
    en: 'Overseas: voting cities from TSE ballot boxes (NM_LOCAL_VOTACAO). Brazil: municipalities (municípios) under each state.',
    pt: 'Exterior: cidades de votação dos boletins de urna do TSE (NM_LOCAL_VOTACAO). Brasil: municípios sob cada UF.',
  },
  suburbTableHint: {
    en: 'Brazil only — each row is an electoral zone, labeled like news maps (e.g. Bela Vista, Piraporinha, Copacabana): official TRE nicknames when known, otherwise main TSE neighborhoods.',
    pt: 'Só Brasil — cada linha é uma zona eleitoral, com rótulo no estilo dos mapas de apuração (ex.: Bela Vista, Piraporinha, Copacabana): apelido oficial do TRE quando conhecido; senão, principais bairros do TSE.',
  },
  selectCountry: {
    en: 'Select a country',
    pt: 'Selecione um país',
  },
  selectCountryPlaceholder: {
    en: 'Choose a country…',
    pt: 'Escolha um país…',
  },
  area: { en: 'Area', pt: 'Área' },
  city: { en: 'City', pt: 'Cidade' },
  suburb: { en: 'Neighborhood', pt: 'Bairro' },
  areas: { en: 'areas', pt: 'áreas' },
  cities: { en: 'cities', pt: 'cidades' },
  suburbs: { en: 'neighborhoods', pt: 'bairros' },
  areaEmpty: {
    en: 'No areas match these filters.',
    pt: 'Nenhuma área com esses filtros.',
  },
  cityEmpty: {
    en: 'No cities match these filters.',
    pt: 'Nenhuma cidade com esses filtros.',
  },
  suburbEmpty: {
    en: 'No neighborhoods match these filters. Select Brazil or turn on Include Brazil.',
    pt: 'Nenhum bairro com esses filtros. Selecione Brasil ou ligue Incluir Brasil.',
  },
  cityLoading: {
    en: 'Loading cities…',
    pt: 'Carregando cidades…',
  },
  suburbLoading: {
    en: 'Loading neighborhoods…',
    pt: 'Carregando bairros…',
  },
  suburbLoadError: {
    en: 'Could not load neighborhoods. Check your connection and try again — this tab is electoral zones labeled as neighborhoods, not cities.',
    pt: 'Não foi possível carregar os bairros. Verifique a conexão e tente de novo — esta aba é por zona eleitoral com nome de bairro, não por cidade.',
  },
  suburbRetry: { en: 'Retry', pt: 'Tentar de novo' },
  cityNo2022Footnote: {
    en: '2022 shares use official TSE section totals (votação por seção). Places that did not exist as voting locals in 2022 show — for 2022/change/swing.',
    pt: 'As % de 2022 usam a votação por seção oficial do TSE. Locais que não existiam como locais de votação em 2022 ficam como — em 2022/variação/swing.',
  },
  hintArea: {
    en: 'TSE area',
    pt: 'Área TSE',
  },
  hintCity: {
    en: 'name',
    pt: 'nome',
  },
  map: { en: 'Map', pt: 'Mapa' },
  noMatch: {
    en: 'No countries match these filters.',
    pt: 'Nenhum país com esses filtros.',
  },
  pendingHint: { en: '2026 tally pending', pt: 'Apuração 2026 pendente' },
  disputedShort: {
    en: 'Disputed 2026 tally — awaiting TSE',
    pt: 'Apuração 2026 contestada — aguardando TSE',
  },
  notes: { en: 'Sections', pt: 'Seções' },
  hintCountry: { en: 'name', pt: 'nome' },
  hintRegion: { en: 'region', pt: 'região' },
  hintVotes2026: {
    en: 'total votes',
    pt: 'total de votos',
  },
  hintVotes2022: {
    en: 'total votes',
    pt: 'total de votos',
  },
  hintShare2026: {
    en: '% of valid votes',
    pt: '% dos votos válidos',
  },
  hintShare2022: {
    en: '% of valid votes',
    pt: '% dos votos válidos',
  },
  hintOther2026: {
    en: '% of valid · other candidates',
    pt: '% dos válidos · outros candidatos',
  },
  hintOther2022: {
    en: '% of valid · other candidates',
    pt: '% dos válidos · outros candidatos',
  },
  hintNoValidVotePct2026: {
    en: '% of registered · abstention + blank + null',
    pt: '% dos aptos · abstenção + branco + nulo',
  },
  hintNoValidVotePct2022: {
    en: '% of registered · abstention + blank + null',
    pt: '% dos aptos · abstenção + branco + nulo',
  },
  hintNoValidVotes2026: {
    en: 'abstention + blank + null (count)',
    pt: 'abstenção + branco + nulo (quantidade)',
  },
  hintNoValidVotes2022: {
    en: 'abstention + blank + null (count)',
    pt: 'abstenção + branco + nulo (quantidade)',
  },
  hintLulaChange: {
    en: 'pp vs 2022 (Δ votes)',
    pt: 'pp vs 2022 (Δ votos)',
  },
  hintBolsonaroChange: {
    en: 'pp vs 2022 (Δ votes)',
    pt: 'pp vs 2022 (Δ votos)',
  },
  hintDifference2026: {
    en: 'Lula % − Bolsonaro % (2026)',
    pt: 'Lula % − Bolsonaro % (2026)',
  },
  hintDifference2022: {
    en: 'Lula % − Bolsonaro % (2022)',
    pt: 'Lula % − Bolsonaro % (2022)',
  },
  hintSwing: {
    en: 'Lula Δ − Bolso Δ · red → Lula, blue → Bolsonaro',
    pt: 'Lula Δ − Bolso Δ · vermelho → Lula, azul → Bolsonaro',
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
    en: 'Comparisons treat Flávio Bolsonaro (2026) against Jair Bolsonaro (2022) for continuity of the Bolsonaro ticket abroad. They are not the same candidate. Percentages use valid votes; swing is Lula change minus Bolsonaro change (percentage points; positive toward Lula, negative toward Bolsonaro).',
    pt: 'As comparações tratam Flávio Bolsonaro (2026) frente a Jair Bolsonaro (2022) pela continuidade da chapa Bolsonaro no exterior. Não são o mesmo candidato. Os percentuais usam votos válidos; o swing é a variação de Lula menos a de Bolsonaro (pontos percentuais; positivo para Lula, negativo para Bolsonaro).',
  },
  disclaimerScope: {
    en: 'Default scope is overseas 1st-round presidential voting. Domestic Brazil (states and municipalities) is optional via Include Brazil / map selection and is excluded from the overseas total.',
    pt: 'O recorte padrão é a votação presidencial do 1º turno no exterior. O Brasil doméstico (UFs e municípios) é opcional via Incluir Brasil / seleção no mapa e fica de fora do total exterior.',
  },
  howToEdit: {
    en: 'The live page refreshes overseas tallies directly from the TSE. Optional: npm run sync:tse && npm run sync:brazil && npm run build:pages to refresh the committed seed JSON.',
    pt: 'A página ao vivo atualiza os totais do exterior direto do TSE. Opcional: npm run sync:tse && npm run sync:brazil && npm run build:pages para atualizar o JSON seed commitado.',
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
  legendLeaderLula: { en: 'Lula % → 100%', pt: 'Lula % → 100%' },
  legendLeaderBolso: {
    en: 'Bolsonaro % → 100%',
    pt: 'Bolsonaro % → 100%',
  },
  legendPending: { en: 'pending', pt: 'pendente' },
  themeLight: { en: 'Light', pt: 'Claro' },
  themeDark: { en: 'Dark', pt: 'Escuro' },
  themeToggle: { en: 'Toggle color theme', pt: 'Alternar tema de cores' },
  scope: {
    en: '1st round · overseas by default · F Bolsonaro compared to J Bolsonaro 2022',
    pt: '1º turno · exterior por padrão · F Bolsonaro comparado a J Bolsonaro 2022',
  },
  Africa: { en: 'Africa', pt: 'África' },
  Americas: { en: 'Americas', pt: 'Américas' },
  Brazil: { en: 'Brazil', pt: 'Brasil' },
  'Asia (excl. Middle East)': {
    en: 'Asia (excl. Middle East)',
    pt: 'Ásia (excl. Oriente Médio)',
  },
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
