import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { mobileEntry } from './vite.mobile.config.js'

// Browser test process only: no .env loading, API server, proxy or real auth client.
export default defineConfig({
  envDir: false,
  plugins: [react(), mobileEntry, {
    name: 'isolated-browser-boundaries',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split('?')[0] === '/src/supabase.ts') {
          response.setHeader('Content-Type', 'application/javascript')
          response.end('export const supabase = null;')
        } else if (request.url?.startsWith('/api/')) {
          response.statusCode = 503
          response.setHeader('Content-Type', 'application/json')
          response.end(JSON.stringify({ code: 'unavailable', error: 'Backend not connected in isolated browser tests.' }))
        } else next()
      })
    },
  }],
  server: { watch: { ignored: ['**/tmp/**', '**/Pebble-Garden-Asset-Work/**', '**/Pebble-Starter/**'] }, host: '127.0.0.1', port: 3194, strictPort: true },
})
