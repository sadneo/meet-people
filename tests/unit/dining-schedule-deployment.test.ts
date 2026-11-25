// @vitest-environment node
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { expect, it } from 'vitest'

it('pauses and reads back native dining cron for its own environment, without logging credentials', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pebble-dining-deployment-test-'))
  try {
    writeFileSync(join(directory, 'pnpm'), `#!/usr/bin/env node
const fs=require('node:fs'),args=process.argv.slice(2),file=args[args.indexOf('--file')+1];
if (!args.includes(process.env.SUPABASE_PROJECT_REF) || (fs.statSync(file).mode & 0o777)!==0o600) process.exit(2);
const sql=fs.readFileSync(file,'utf8');
if (!sql.includes('cron.alter_job(jobid, active := false)') || sql.includes('configure_dining_schedule') || sql.includes('decrypted_secret')) process.exit(3);
if (process.env.DINING_TEST_DB_FAILURE) { console.error('private-test-token');process.exit(1); }
const rows=process.env.DINING_TEST_ABSENT ? [] : [{jobname:'pebble-ingest-dining',active:!!process.env.DINING_TEST_ACTIVE}];
console.log(JSON.stringify({rows}));
`, { mode: 0o700 })
    const environments = {
      production: { DEPLOY_ENVIRONMENT: 'production', SUPABASE_PROJECT_REF: 'wacgxhsdhrqigrmqaonc', SUPABASE_URL: 'https://wacgxhsdhrqigrmqaonc.supabase.co' },
      sandbox: { DEPLOY_ENVIRONMENT: 'sandbox', SUPABASE_PROJECT_REF: 'wixdiotkntapwrbibaom', SUPABASE_URL: 'https://wixdiotkntapwrbibaom.supabase.co' },
    }
    const run = (overrides: Record<string, string>) => spawnSync('node', ['scripts/deploy-dining-schedules.mjs'], { env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, ...overrides }, encoding: 'utf8' })
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
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
