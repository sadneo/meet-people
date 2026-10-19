import { defineConfig } from '@playwright/test'
// Explicit operator test only; never starts services or intercepts SDK/API responses.
export default defineConfig({testDir:'.',testMatch:'local-demo-smoke.spec.ts',outputDir:'../../worktree/safety-owner-review/local-demo-smoke-results',workers:1,use:{baseURL:'http://127.0.0.1:3006',trace:'off',video:'off',screenshot:'off'}})
