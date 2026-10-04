# eleições exterior

Bilingual (EN/PT) explorer for **Brazilian overseas presidential results** — 1st round only — comparing 2026 ballot-box tallies to 2022 TSE open data. Flávio Bolsonaro is compared to Jair Bolsonaro (2022).

## Run locally

```bash
npm install
npm run dev
```

App runs at [http://localhost:4837/eleicoes-exterior/](http://localhost:4837/eleicoes-exterior/).

## Update results

Edit [`src/data/results.json`](src/data/results.json), then rebuild. Pending countries keep 2022 figures and leave 2026 blank until a BU roundup is published.

## Build / GitHub Pages

```bash
npm run build
```

Static output is in `dist/`. With `base: '/eleicoes-exterior/'`, deploy that folder to GitHub Pages for the `eleicoes-exterior` repository (Settings → Pages → Deploy from branch → `/docs` or GitHub Actions).

## Stack

Vite · React · TypeScript · Tailwind CSS · d3-geo / d3-scale · world-atlas
