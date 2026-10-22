import { defineConfig } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3100'
const endpoint = new URL(baseURL)
if (endpoint.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)) throw new Error('Built smoke tests require a local HTTP server. Use the opt-in hosted checks for deployed environments.')

export default defineConfig({
  testDir: './tests/integration/built',
  testMatch: '**/*.spec.ts',
  outputDir: './test-results/built',
  use: {
    baseURL,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : undefined,
  },
})
