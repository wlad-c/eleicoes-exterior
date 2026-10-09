# eleições exterior

Bilingual (EN/PT) explorer for **Brazilian presidential results abroad** — 1st round only — comparing 2026 ballot-box tallies to 2022 TSE open data. Flávio Bolsonaro is compared to Jair Bolsonaro (2022). Optional domestic Brazil (states as Area, municipalities as City, electoral zones as Zona) is available via **Include Brazil** or selecting Brazil on the map.

## Run locally

```bash
npm install
npm run dev
```

App runs at [http://localhost:4837/eleicoes-exterior/](http://localhost:4837/eleicoes-exterior/).

## Update results

Live TSE refresh is **paused until New Zealand booths close for the runoff** (`2026-10-25T04:00:00Z` = 17:00 NZDT). From then on, open tabs pull overseas (ZZ) tallies on load, on focus, and every **30 minutes**. Vote updates do not require a redeploy.

Optional seed sync (cold load / SEO; also via GitHub Actions every 48 hours):

```bash
npm run sync:tse
npm run sync:brazil           # domestic BR: national + UF areas + municipalities
npm run build:brazil-locals   # within-municipality electoral zones (Zona tab)
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
