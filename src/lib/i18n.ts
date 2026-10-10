import type { Lang } from '../types'

const dict = {
  brand: { en: 'eleições exterior', pt: 'eleições exterior' },
  reported: { en: 'reported', pt: 'apurados' },
  pending: { en: 'pending', pt: 'pendentes' },
  countries: { en: 'countries', pt: 'países' },
  search: { en: 'Search country…', pt: 'Buscar país…' },
  searchCity: { en: 'Search city or country…', pt: 'Buscar cidade ou país…' },
  searchArea: { en: 'Search area or country…', pt: 'Buscar área ou país…' },
  searchSuburb: {
    en: 'Search neighborhood, municipality, or Brazil…',
    pt: 'Buscar bairro, município ou Brasil…',
  },
  tabCountries: { en: 'Country', pt: 'País' },
  tabAreas: { en: 'Area', pt: 'Área' },
  tabCities: { en: 'City', pt: 'Cidade' },
  tabSuburbs: { en: 'Neighborhood', pt: 'Bairro' },
  tableView: { en: 'Table view', pt: 'Visão da tabela' },
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
    en: 'No matches',
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
    en: 'Off by default — turn on or select Brazil on the map to show domestic rows in the tables',
    pt: 'Desligado por padrão — ligue ou selecione Brasil no mapa para ver linhas domésticas nas tabelas',
  },
  allRegions: {
    en: 'All global regions',
    pt: 'Todas as regiões globais',
  },
  filterGlobalRegions: {
    en: 'Global regions',
    pt: 'Regiões globais',
  },
  status: { en: 'Status', pt: 'Status' },
  statusAll: { en: 'All countries', pt: 'Todos os países' },
  statusReported: { en: 'Reported only', pt: 'Só apurados' },
  statusPending: { en: 'Pending only', pt: 'Só pendentes' },
  mapMetric: { en: 'Heatmap metric', pt: 'Métrica do mapa de calor' },
  lulaChange: { en: 'Lula change', pt: 'Variação Lula' },
  bolsonaroChange: { en: 'Bolsonaro change', pt: 'Variação Bolsonaro' },
  swingToLula: { en: 'Swing to Lula', pt: 'Swing para Lula' },
  swingToBolsonaro: { en: 'Swing to Bolsonaro', pt: 'Swing para Bolsonaro' },
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
  votes2026: { en: 'Total votes 2026', pt: 'Total de votos 2026' },
  votes2022: { en: 'Total votes 2022', pt: 'Total de votos 2022' },
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
    en: '2026 other candidates %',
    pt: 'Outros candidatos % 2026',
  },
  otherPct2022: {
    en: '2022 other candidates %',
    pt: 'Outros candidatos % 2022',
  },
  abstentionPct2026: {
    en: '2026 abstention %',
    pt: 'Abstenção % 2026',
  },
  abstentionPct2022: {
    en: '2022 abstention %',
    pt: 'Abstenção % 2022',
  },
  abstentions2026: {
    en: 'Abstentions 2026',
    pt: 'Abstenções 2026',
  },
  abstentions2022: {
    en: 'Abstentions 2022',
    pt: 'Abstenções 2022',
  },
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
  mapBack: {
    en: 'Broader map',
    pt: 'Mapa anterior',
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
    en: 'Drag ⋮⋮ (or a column header) to reorder. Same order for country, area, city, and suburb.',
    pt: 'Arraste ⋮⋮ (ou o cabeçalho da coluna) para reordenar. A mesma ordem vale para país, área, cidade e município.',
  },
  tableColumnsDrag: {
    en: 'Drag to reorder columns',
    pt: 'Arraste para reordenar colunas',
  },
  colLula2026: { en: 'Lula 2026', pt: 'Lula 2026' },
  colFBolsonaro2026: { en: 'F Bolsonaro 2026', pt: 'F Bolsonaro 2026' },
  colLula2022: { en: 'Lula 2022', pt: 'Lula 2022' },
  colJBolsonaro2022: { en: 'J Bolsonaro 2022', pt: 'J Bolsonaro 2022' },
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
    en: 'Brazil only — each row is an electoral zone, labeled like news maps (e.g. Bela Vista, Piraporinha, Copacabana): official TRE nicknames when known, otherwise main TSE bairros.',
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
    en: 'Loading city / municipality breakdown…',
    pt: 'Carregando detalhamento por cidade / município…',
  },
  suburbLoading: {
    en: 'Loading neighborhood-labeled electoral zones…',
    pt: 'Carregando zonas eleitorais com nome de bairro…',
  },
  suburbLoadError: {
    en: 'Could not load the neighborhood breakdown. Check your connection and try again — this tab is zone/neighborhood level, not municipalities.',
    pt: 'Não foi possível carregar o detalhamento por bairro. Verifique a conexão e tente de novo — esta aba é por zona/bairro, não municípios.',
  },
  suburbRetry: { en: 'Retry', pt: 'Tentar de novo' },
  cityNo2022Footnote: {
    en: '2022 shares use official TSE section totals (votação por seção). Places that did not exist as voting locals in 2022 show — for 2022/change/swing.',
    pt: 'As % de 2022 usam a votação por seção oficial do TSE. Locais que não existiam como locais de votação em 2022 ficam como — em 2022/variação/swing.',
  },
  hintArea: {
    en: 'TSE area',
    pt: 'área TSE',
  },
  hintCity: {
    en: 'name',
    pt: 'nome',
  },
  map: { en: 'Swing map', pt: 'Mapa de oscilação' },
  noMatch: { en: 'No countries match these filters.', pt: 'Nenhum país com esses filtros.' },
  pendingHint: { en: '2026 tally pending', pt: 'Apuração 2026 pendente' },
  disputedShort: {
    en: 'Disputed 2026 tally — see notes / awaiting TSE',
    pt: 'Apuração 2026 contestada — ver notas / aguardando TSE',
  },
  notes: { en: 'Sections', pt: 'Seções' },
  hintCountry: { en: 'name', pt: 'nome' },
  hintRegion: { en: 'world region', pt: 'região' },
  hintVotes2026: {
    en: 'total votes',
    pt: 'total de votos',
  },
  hintVotes2022: {
    en: 'total votes',
    pt: 'total de votos',
  },
  hintShare2026: {
    en: '% of valid (votes)',
    pt: '% dos válidos (votos)',
  },
  hintShare2022: {
    en: '% of valid (votes)',
    pt: '% dos válidos (votos)',
  },
  hintOther2026: {
    en: '% of valid · other candidates',
    pt: '% dos válidos · outros candidatos',
  },
  hintOther2022: {
    en: '% of valid · other candidates',
    pt: '% dos válidos · outros candidatos',
  },
  hintAbstention2026: {
    en: '% of registered (non-voters)',
    pt: '% dos aptos (não votaram)',
  },
  hintAbstention2022: {
    en: '% of registered (non-voters)',
    pt: '% dos aptos (não votaram)',
  },
  hintAbstentionVotes2026: {
    en: 'non-voters (count)',
    pt: 'não votaram (quantidade)',
  },
  hintAbstentionVotes2022: {
    en: 'non-voters (count)',
    pt: 'não votaram (quantidade)',
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
  hintSwingToBolsonaro: {
    en: 'Bolso Δ − Lula Δ',
    pt: 'Bolso Δ − Lula Δ',
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
    en: 'Default scope is overseas 1st-round presidential voting. Domestic Brazil (states and municipalities) is optional via Include Brazil / map selection and is excluded from the overseas running total.',
    pt: 'O recorte padrão é a votação presidencial do 1º turno no exterior. O Brasil doméstico (UFs e municípios) é opcional via Incluir Brasil / seleção no mapa e fica de fora do total parcial do exterior.',
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
