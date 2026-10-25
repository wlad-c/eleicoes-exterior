# eleições exterior

Bilingual (EN/PT) explorer for **Brazilian presidential results abroad** — **1st round and runoff in one view** — with 2026 ballot-box tallies compared to the matching 2022 TSE open-data round. Flávio Bolsonaro is compared to Jair Bolsonaro (2022). Optional domestic Brazil (states as Area, municipalities as City, electoral zones as Zona) is available via **Include Brazil** or selecting Brazil on the map (Brazil city/bairro grain still reflects 2026 1º until runoff domestic sync lands).

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

## Live updates (runoff night)

Live TSE refresh is **paused until New Zealand booths close** (`2026-10-25T04:00:00Z` = 17:00 NZDT). From then on, the app pulls overseas (ZZ) tallies on load, on focus, and every **2 minutes** for ~36h, then every **30 minutes**. Vote updates do not require a redeploy.

Until TSE publishes a country, night-of **press BU** tallies are merged automatically. GitHub Actions runs `scrape:press:runoff -- --apply` every **20 minutes** from NZ close through Monday afternoon UTC: it rechecks allowlisted outlets (**g1, UOL, CNN Brasil, Poder360, Exame, Brasil de Fato, BNews, Metro1, O Globo, Folha, Estadão**), discovers new exterior/BU article links from their hubs, falls back via curl+r.jina.ai when bot-blocked, parses each outlet’s tally format, and writes absolute tallies into pending/press rows only (never overwrites `source: 'tse'`; skips weak %-only when absolute already exists). The live page re-reads the deployed seed every **2 minutes**, so newly scraped countries appear without a manual redeploy.

Manual / local:

```bash
# Optional: refresh article URLs in scripts/data/press-runoff-sources.json
npm run scrape:press:runoff          # dry-run (all allowlisted sources)
npm run scrape:press:runoff -- --apply
npm run scrape:press:runoff -- --url=https://…   # extra article
```

Official TSE always overwrites press rows (`source: 'tse'`). After Brazil’s polls close (`2026-10-25T20:00:00Z`), the browser also pulls live TSE ZZ directly.

Optional seed sync (cold load / SEO; GitHub Actions every 48h, and every 20 min on 25–26 Oct):

```bash
npm run sync:tse              # 1º turno
npm run sync:tse:runoff       # 2º turno (6258)
npm run scaffold:runoff       # rebuild pending runoff shell from 1º geography
npm run build:city-2022-r2    # 2022 2º overseas caches
npm run sync:brazil           # domestic BR (1º)
npm run build:brazil-locals
npm run build:pages
```

Override the client timer locally with `?refreshMs=<ms>`.

## Build / GitHub Pages

```bash
npm run build
npm run build:pages
```

Static site for Pages is committed under `docs/` (Settings → Pages → Deploy from branch `main` / `docs`). Live URL:

https://wlad-c.github.io/eleicoes-exterior/


## Stack

Vite · React · TypeScript · Tailwind CSS · d3-geo / d3-scale · world-atlas
