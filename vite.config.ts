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

/** Keep a stable public URL in sync with the editable source JSON. */
function syncResultsJson(): Plugin {
  const write = () => {
    mkdirSync(dirname(resultsPublic), { recursive: true })
    copyFileSync(resultsSrc, resultsPublic)
  }

  return {
    name: 'sync-results-json',
    buildStart() {
      write()
    },
    configureServer(server) {
      write()
      server.watcher.add(resultsSrc)
      server.watcher.on('change', (path) => {
        if (resolve(path) === resultsSrc) write()
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
  },
  preview: {
    host: true,
    port: 4838,
    strictPort: true,
  },
})
