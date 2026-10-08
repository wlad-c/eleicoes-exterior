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
const suburbsSrc = resolve(rootDir, 'src/data/brazil-suburbs.json')
const suburbsPublic = resolve(rootDir, 'public/data/brazil-suburbs.json')

/** Keep stable public URLs in sync with the editable source JSON. */
function syncResultsJson(): Plugin {
  const write = () => {
    mkdirSync(dirname(resultsPublic), { recursive: true })
    copyFileSync(resultsSrc, resultsPublic)
    try {
      copyFileSync(suburbsSrc, suburbsPublic)
    } catch {
      /* suburbs file optional until first brazil sync */
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
      server.watcher.add(suburbsSrc)
      server.watcher.on('change', (path) => {
        const abs = resolve(path)
        if (abs === resultsSrc || abs === suburbsSrc) write()
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
