import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  testMatch: '**/*.spec.ts',
  outputDir: './test-results/browser',
  workers: 2,
  use: {
    baseURL: 'http://127.0.0.1:3194',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : undefined,
  },
  webServer: {
    command: 'pnpm exec vite --config vite.isolated.config.ts',
    url: 'http://127.0.0.1:3194',
    reuseExistingServer: false,
  },
})
