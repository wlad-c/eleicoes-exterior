import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'

const rootDir = dirname(fileURLToPath(import.meta.url))
const resultsSrc = resolve(rootDir, 'src/data/results.json')
const resultsPublic = resolve(rootDir, 'public/data/results.json')
const resultsRunoffSrc = resolve(rootDir, 'src/data/results-runoff.json')
const resultsRunoffPublic = resolve(rootDir, 'public/data/results-runoff.json')
const citiesSrc = resolve(rootDir, 'src/data/brazil-cities.json')
const citiesPublic = resolve(rootDir, 'public/data/brazil-cities.json')
const citiesRunoffSrc = resolve(rootDir, 'src/data/brazil-cities-runoff.json')
const citiesRunoffPublic = resolve(
  rootDir,
  'public/data/brazil-cities-runoff.json',
)
const suburbsSrc = resolve(rootDir, 'src/data/brazil-suburbs.json')
const suburbsPublic = resolve(rootDir, 'public/data/brazil-suburbs.json')
const suburbsRunoffSrc = resolve(rootDir, 'src/data/brazil-suburbs-runoff.json')
const suburbsRunoffPublic = resolve(
  rootDir,
  'public/data/brazil-suburbs-runoff.json',
)
const ufsSrc = resolve(rootDir, 'src/data/brazil-ufs.json')
const ufsPublic = resolve(rootDir, 'public/data/brazil-ufs.json')
const municipiosSrc = resolve(rootDir, 'src/data/brazil-municipios.topojson')
const municipiosPublic = resolve(
  rootDir,
  'public/data/brazil-municipios.topojson',
)

const syncedDataFiles = [
  [resultsSrc, resultsPublic],
  [resultsRunoffSrc, resultsRunoffPublic],
  [citiesSrc, citiesPublic],
  [citiesRunoffSrc, citiesRunoffPublic],
  [suburbsSrc, suburbsPublic],
  [suburbsRunoffSrc, suburbsRunoffPublic],
  [ufsSrc, ufsPublic],
  [municipiosSrc, municipiosPublic],
] as const

/** Keep stable public URLs in sync with the editable source JSON. */
function syncResultsJson(): Plugin {
  const write = () => {
    mkdirSync(dirname(resultsPublic), { recursive: true })
    for (const [src, dest] of syncedDataFiles) {
      try {
        copyFileSync(src, dest)
      } catch {
        /* optional until scaffold / brazil sync / locals build */
      }
    }
  }

  return {
    name: 'sync-results-json',
    buildStart() {
      write()
    },
    configureServer(server) {
      write()
      for (const [src] of syncedDataFiles) server.watcher.add(src)
      server.watcher.on('change', (path) => {
        const abs = resolve(path)
        if (syncedDataFiles.some(([src]) => abs === src)) write()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), syncResultsJson()],
  base: '/eleicoes-exterior/',
  server: {
    host: true,
    port: 4837,
    strictPort: true,
    proxy: {
      // Browser CORS only allows github.io; proxy for local live TSE checks.
      '/tse-api': {
        target: 'https://resultados.tse.jus.br',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/tse-api/, ''),
      },
    },
  },
  preview: {
    host: true,
    port: 4838,
    strictPort: true,
    proxy: {
      '/tse-api': {
        target: 'https://resultados.tse.jus.br',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/tse-api/, ''),
      },
    },
  },
})
