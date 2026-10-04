import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
