import type { Connect, Plugin } from 'vite'

const serveRunId = (server: { middlewares: Connect.Server }) => {
  server.middlewares.use('/__pebble/run', (_request, response) => {
    response.setHeader('Content-Type', 'text/plain')
    response.end(process.env.PEBBLE_RUN_ID ?? '')
  })
}

export const runIdPlugin = (): Plugin => ({
  name: 'pebble-run-id',
  configureServer: serveRunId,
  configurePreviewServer: serveRunId,
})
