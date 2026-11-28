import { defineConfig } from '@playwright/test'

const port = process.env.PEBBLE_BROWSER_PORT
if (!port) throw new Error('PEBBLE_BROWSER_PORT is not set. Run browser tests with `pnpm test:browser`.')
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests/browser',
  testMatch: '**/*.spec.ts',
  outputDir: `./test-results/browser-${port}`,
  workers: 2,
  use: {
    baseURL,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : undefined,
  },
  webServer: {
    command: `node node_modules/vite/bin/vite.js --config vite.isolated.config.ts --port ${port}`,
    url: `${baseURL}/__pebble/run`,
  },
})
