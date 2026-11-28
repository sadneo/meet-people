// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { expect, it } from 'vitest'

it('pauses and reads back native dining cron for its own environment, without logging credentials', () => {
  const environments = {
    production: { DEPLOY_ENVIRONMENT: 'production', SUPABASE_PROJECT_REF: 'wacgxhsdhrqigrmqaonc', SUPABASE_URL: 'https://wacgxhsdhrqigrmqaonc.supabase.co' },
    sandbox: { DEPLOY_ENVIRONMENT: 'sandbox', SUPABASE_PROJECT_REF: 'wixdiotkntapwrbibaom', SUPABASE_URL: 'https://wixdiotkntapwrbibaom.supabase.co' },
  }
  const run = (overrides: Record<string, string>) => spawnSync(
    process.execPath,
    ['--import', './tests/fixtures/deployment-clis.mjs', 'scripts/deploy-dining-schedules.mjs'],
    { env: { ...overrides, PATH: '', SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMPDIR: process.env.TMPDIR }, encoding: 'utf8' },
  )
  for (const overrides of [environments.production, environments.sandbox, { ...environments.production, DINING_TEST_ABSENT: 'true' }]) {
    const result = run(overrides)
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('paused')
  }
  for (const overrides of [{ ...environments.sandbox, SUPABASE_PROJECT_REF: 'wacgxhsdhrqigrmqaonc' }, { ...environments.production, DEPLOY_ENVIRONMENT: 'staging' },
    { ...environments.production, DINING_TEST_DB_FAILURE: 'true' }, { ...environments.production, DINING_TEST_ACTIVE: 'true' }]) {
    const result = run(overrides)
    expect(result.status).not.toBe(0)
    expect(result.stdout + result.stderr).not.toContain('private-test-token')
  }
})
