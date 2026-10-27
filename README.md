# eleições exterior

Bilingual (EN/PT) explorer for **Brazilian presidential results abroad** — **1st round and runoff in one view** — with 2026 ballot-box tallies compared to the matching 2022 TSE open-data round. Flávio Bolsonaro is compared to Jair Bolsonaro (2022). Optional domestic Brazil (states as Area, municipalities as City, electoral zones as Bairro, voting places as Local) is available via **Include Brazil** or selecting Brazil on the map. The **Local** tab is a Nexo-style point map: each marker is a `local de votação`, aggregating every BU (seção) at that building for the 2026 runoff.

## Run locally

```bash
npm install
npm run dev
```

App runs at [http://localhost:4837/eleicoes-exterior/](http://localhost:4837/eleicoes-exterior/).

## Data model (unified)

Primary fields are **runoff** (`y2026` / `y2022`). First-round tallies are attached as `yRound1` (2026 1º) and `y2022Round1` (2022 1º). Map and table metrics cover:

- **2026 / 2022 runoff** — votes, shares, leader, difference
- **2026 / 2022 1st round** — votes, shares, leader, difference
- **Within-year round shift** — 2026 runoff vs 1st round; 2022 runoff vs 1st round
- **Year-over-year** — 2026 runoff vs 2022 runoff (change / swing)

Landing defaults feature **2026 runoff** totals, map **swing vs 2026 1st round**, and table columns for runoff votes/% plus change and swing vs 1st round.

Seeds:

- `src/data/results.json` — 1º turno (election `6257`)
- `src/data/results-runoff.json` — 2º turno (election `6258`)

## Live updates

TSE runoff totalization reached **100%** for overseas (ZZ) and domestic Brazil. **Scheduled GitHub Actions syncs are disabled** (workflow is `workflow_dispatch` only). Agent/press scrape timers are stopped.

The browser may still pull live TSE on load/focus for verification; committed seeds under `src/data/` and `docs/data/` are the durable source for cold loads / SEO.

Manual seed sync (optional):

```bash
npm run sync:tse:runoff                 # overseas ZZ 2º turno (6258)
npm run sync:brazil:runoff              # domestic BR 2º (or -- --uf-only)
npm run build:brazil-locais-runoff      # ~94k voting-place points (Nexo-style map)
npm run scrape:press:runoff -- --apply  # legacy press BUs (skipped where TSE exists)
npm run build:pages
```

Override any remaining client poll locally with `?refreshMs=<ms>` (or omit to use the default cadence).

## Build / GitHub Pages

```bash
npm run build
npm run build:pages
```

Static site for Pages is committed under `docs/` (Settings → Pages → Deploy from branch `main` / `docs`). Live URL:

https://wlad-c.github.io/eleicoes-exterior/


## Stack

Vite · React · TypeScript · Tailwind CSS · d3-geo / d3-scale · world-atlas
