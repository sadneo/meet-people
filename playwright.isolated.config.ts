import { defineConfig } from '@playwright/test'

const port = Number(process.env.E2E_PORT ?? 3194)
if (port !== 3194) throw new Error('This isolated suite is restricted to E2E_PORT 3194.')
export default defineConfig({
  testDir: './e2e',
  workers: 2,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : undefined,
  },
  webServer: {
    command: 'pnpm exec vite --config vite.isolated.config.ts',
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    env: { E2E_PORT: '3194' },
  },
})
