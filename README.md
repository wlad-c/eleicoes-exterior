# eleições exterior

Bilingual (EN/PT) explorer for **Brazilian overseas presidential results** — 1st round only — comparing 2026 ballot-box tallies to 2022 TSE open data. Flávio Bolsonaro is compared to Jair Bolsonaro (2022).

## Run locally

```bash
npm install
npm run dev
```

App runs at [http://localhost:4837/eleicoes-exterior/](http://localhost:4837/eleicoes-exterior/).

## Update results

**Prefer official TSE data.** Sync overseas (ZZ) presidential tallies from the TSE Resultados EA20 JSON:

```bash
node scripts/sync-tse-zz.mjs
npm run build:pages
```

That overwrites 2026 country rows whenever the TSE has published sections for the mapped ZZ municipalities. Press/BU figures remain only for countries the TSE has not yet released. You can still edit [`src/data/results.json`](src/data/results.json) by hand if needed.

The live page also serves a stable copy at `data/results.json`. Open tabs **fetch it on load**, again when the window regains focus, and on a timer (**5 minutes** through `2026-10-05T03:50:00Z`, then **30 minutes**), so redeployed tallies appear without a full reload. Override locally with `?refreshMs=<ms>`.

## Build / GitHub Pages

```bash
npm run build
npm run build:pages
```

Static site for Pages is committed under `docs/` (Settings → Pages → Deploy from branch `main` / `docs`). Live URL:

https://wlad-c.github.io/eleicoes-exterior/


## Stack

Vite · React · TypeScript · Tailwind CSS · d3-geo / d3-scale · world-atlas
