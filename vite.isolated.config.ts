import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Browser test process only: no .env loading, API server, proxy or real auth client.
export default defineConfig({
  envDir: false,
  plugins: [react(), {
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
  server: { host: '127.0.0.1', port: 3194, strictPort: true },
})
