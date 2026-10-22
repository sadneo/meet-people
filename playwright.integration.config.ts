import { defineConfig } from '@playwright/test'
import browser from './playwright.config'

// Actual Express/PostgreSQL acceptance; requires the disposable offline DB fixture.
export default defineConfig(browser, {
  testDir: './tests/integration/browser',
  testMatch: '**/*.spec.ts',
  outputDir: './test-results/integration-browser',
  workers: 1,
})
