import { defineConfig } from 'vitest/config'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const apiPort = process.env.API_PORT ?? 3001
const proxy = { '/api': `http://127.0.0.1:${apiPort}` }

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist/web',
  },
  server: {
    host: '127.0.0.1',
    port: Number(process.env.VITE_PORT ?? 3000),
    strictPort: true,
    proxy,
  },
  preview: {
    host: '127.0.0.1',
    port: Number(process.env.VITE_PREVIEW_PORT ?? 4173),
    strictPort: true,
    proxy,
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
  },
})
