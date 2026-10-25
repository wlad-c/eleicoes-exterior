# eleições exterior

Bilingual (EN/PT) explorer for **Brazilian presidential results abroad** — **1st round** and **runoff** tabs — comparing 2026 ballot-box tallies to the matching 2022 TSE open-data round. Flávio Bolsonaro is compared to Jair Bolsonaro (2022). Optional domestic Brazil (states as Area, municipalities as City, electoral zones as Zona) is available via **Include Brazil** or selecting Brazil on the map (1º turno grain files today; runoff domestic sync pending).

## Run locally

```bash
npm install
npm run dev
```

App runs at [http://localhost:4837/eleicoes-exterior/](http://localhost:4837/eleicoes-exterior/).

## Rounds

- **1º turno** — frozen seed (`src/data/results.json`, election `6257`).
- **2º turno** — `src/data/results-runoff.json`, election `6258`. Default tab after NZ booths close (`2026-10-25T04:00:00Z`). Adds **1º→2º** shift columns plus year-over-year **2026 2º vs 2022 2º**.

## Live updates (runoff night)

Live TSE refresh is **paused until New Zealand booths close** (`2026-10-25T04:00:00Z` = 17:00 NZDT). From then on, the runoff tab pulls overseas (ZZ) tallies on load, on focus, and every **2 minutes** for ~36h, then every **30 minutes**. Vote updates do not require a redeploy.

Until TSE publishes a country, night-of **press BU** tallies can be merged. The scraper checks allowlisted outlets (**g1, UOL, CNN Brasil, Poder360, Exame, Brasil de Fato, BNews, Metro1, O Globo, Folha, Estadão**), discovers exterior/BU links from hubs (including markdown from the reader fallback), falls back via curl+r.jina.ai when an outlet bot-blocks, parses each outlet’s tally format, and prefers richer absolute vote counts over %-only snippets:

```bash
# Optional: refresh article URLs in scripts/data/press-runoff-sources.json
npm run scrape:press:runoff          # dry-run (all allowlisted sources)
npm run scrape:press:runoff -- --apply
npm run scrape:press:runoff -- --url=https://…   # extra article
```

Official TSE always overwrites press rows (`source: 'tse'`).

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
