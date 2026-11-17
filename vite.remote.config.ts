import { mergeConfig } from 'vite'
import mobile from './vite.mobile.config.js'

// Explicit .env values come from run-remote-messaging.mjs. The browser and local
// API use one remote project, without modifying the ordinary local setup.
export default mergeConfig(mobile, {
  envDir: false,
  server: { proxy: { '/api': `http://127.0.0.1:${process.env.API_PORT}` } },
})
