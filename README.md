# eleições exterior

Bilingual (EN/PT) explorer for **Brazilian overseas presidential results** — 1st round only — comparing 2026 ballot-box tallies to 2022 TSE open data. Flávio Bolsonaro is compared to Jair Bolsonaro (2022).

## Run locally

```bash
npm install
npm run dev
```

App runs at [http://localhost:4837/eleicoes-exterior/](http://localhost:4837/eleicoes-exterior/).

## Update results

Edit [`src/data/results.json`](src/data/results.json), then rebuild (`npm run build:pages` for GitHub Pages). Pending countries keep 2022 figures and leave 2026 blank until a BU roundup is published.

The live page also serves a stable copy at `data/results.json`. Open tabs **fetch it on load**, again when the window regains focus, and on a **30-minute** timer, so redeployed tallies appear without a full reload. This does **not** scrape press sources — maintainers still edit `results.json` and rebuild.

## Build / GitHub Pages

```bash
npm run build
npm run build:pages
```

Static site for Pages is committed under `docs/` (Settings → Pages → Deploy from branch `main` / `docs`). Live URL:

https://wlad-c.github.io/eleicoes-exterior/


## Stack

Vite · React · TypeScript · Tailwind CSS · d3-geo / d3-scale · world-atlas
