import { app } from './index.js'
import { env } from './env.js'

const server = app.listen(env.PORT, '0.0.0.0', () => {
  console.log(`API listening on http://0.0.0.0:${env.PORT}`)
})

function stop() {
  server.close(() => process.exit(0))
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)
