# eleições exterior

Bilingual (EN/PT) explorer for **Brazilian presidential results abroad** — 1st round only — comparing 2026 ballot-box tallies to 2022 TSE open data. Flávio Bolsonaro is compared to Jair Bolsonaro (2022). Optional domestic Brazil (states as Area, municipalities as Suburb) is available via **Include Brazil** or selecting Brazil on the map.

## Run locally

```bash
npm install
npm run dev
```

App runs at [http://localhost:4837/eleicoes-exterior/](http://localhost:4837/eleicoes-exterior/).

## Update results

The live page pulls overseas (ZZ) presidential tallies **directly from the TSE** in the browser on load, on focus, and every **2 minutes** (through `2026-10-05T03:50:00Z`, then every 30 minutes). Vote updates do not require a redeploy.

Optional seed sync (cold load / SEO; also via GitHub Actions every 48 hours):

```bash
npm run sync:tse
npm run sync:brazil   # domestic BR: national + UF areas + municipalities
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
