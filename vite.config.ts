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
const citiesSrc = resolve(rootDir, 'src/data/brazil-cities.json')
const citiesPublic = resolve(rootDir, 'public/data/brazil-cities.json')
const suburbsSrc = resolve(rootDir, 'src/data/brazil-suburbs.json')
const suburbsPublic = resolve(rootDir, 'public/data/brazil-suburbs.json')
const ufsSrc = resolve(rootDir, 'src/data/brazil-ufs.geojson')
const ufsPublic = resolve(rootDir, 'public/data/brazil-ufs.geojson')

/** Keep stable public URLs in sync with the editable source JSON. */
function syncResultsJson(): Plugin {
  const write = () => {
    mkdirSync(dirname(resultsPublic), { recursive: true })
    copyFileSync(resultsSrc, resultsPublic)
    for (const [src, dest] of [
      [citiesSrc, citiesPublic],
      [suburbsSrc, suburbsPublic],
      [ufsSrc, ufsPublic],
    ] as const) {
      try {
        copyFileSync(src, dest)
      } catch {
        /* optional until brazil sync / locals build */
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
      server.watcher.add(resultsSrc)
      server.watcher.add(citiesSrc)
      server.watcher.add(suburbsSrc)
      server.watcher.add(ufsSrc)
      server.watcher.on('change', (path) => {
        const abs = resolve(path)
        if (
          abs === resultsSrc ||
          abs === citiesSrc ||
          abs === suburbsSrc ||
          abs === ufsSrc
        ) {
          write()
        }
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
