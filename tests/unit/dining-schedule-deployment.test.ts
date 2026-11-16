// @vitest-environment node
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { expect, it } from 'vitest'

it('reconciles production schedules without exposing tokens and refuses unknown cloud failures', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pebble-dining-deployment-test-'))
  const statePath = join(directory, 'state.json')
  try {
    writeFileSync(join(directory, 'pnpm'), '#!/usr/bin/env node\nconsole.log(JSON.stringify({rows:[{decrypted_secret:"private-test-token"}]}))\n', { mode: 0o700 })
    writeFileSync(join(directory, 'gcloud'), `#!/usr/bin/env node
const fs = require('node:fs'), args = process.argv.slice(2), path = process.env.DINING_TEST_STATE;
const state = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf8')) : {};
const name = args[2] === 'describe' ? args[3] : args[4];
if (process.env.DINING_TEST_FAILURE) { console.error('PERMISSION_DENIED'); process.exit(1); }
if (args[2] === 'describe') {
  if (!state[name]) { console.error('NOT_FOUND'); process.exit(1); }
  console.log(JSON.stringify(state[name]));
} else {
  const file = args.find(arg => arg.startsWith('--flags-file=')).slice('--flags-file='.length);
  if ((fs.statSync(file).mode & 0o777) !== 0o600) process.exit(2);
  const flags = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (flags['--attempt-deadline'] !== '180s' || flags['--max-retry-attempts'] !== 0) process.exit(3);
  state[name] = {schedule:flags['--schedule'],timeZone:flags['--time-zone'],state:'ENABLED',
    httpTarget:{uri:flags['--uri'],httpMethod:flags['--http-method'],
      body:Buffer.from(flags['--message-body']).toString('base64'),headers:flags['--headers'] || flags['--update-headers']}};
  fs.writeFileSync(path, JSON.stringify(state));
  console.log(JSON.stringify(state[name]));
}
`, { mode: 0o700 })
    const env = { ...process.env, PATH: `${directory}:${process.env.PATH}`, DINING_TEST_STATE: statePath,
      DEPLOY_ENVIRONMENT: 'production', GCP_PROJECT_ID: 'cse416-meet-people', SUPABASE_URL: 'https://wacgxhsdhrqigrmqaonc.supabase.co' }
    const run = (overrides = {}) => spawnSync('node', ['scripts/deploy-dining-schedules.mjs'], { env: { ...env, ...overrides }, encoding: 'utf8' })
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = run()
      expect(result.status, result.stderr).toBe(0)
      expect(result.stdout + result.stderr).not.toContain('private-test-token')
      const jobs = JSON.parse(readFileSync(statePath, 'utf8'))
      expect(Object.keys(jobs)).toEqual(['pebble-ingest-dining-schedule'])
      for (const job of Object.values(jobs) as { schedule: string; timeZone: string; httpTarget: { uri: string; body: string } }[]) {
        expect(job.schedule).toBe('0 6 * * *')
        expect(job.timeZone).toBe('America/New_York')
        expect(job.httpTarget.uri).toBe('https://wacgxhsdhrqigrmqaonc.supabase.co/functions/v1/ingest-dining')
        expect(JSON.parse(Buffer.from(job.httpTarget.body, 'base64').toString())).toEqual({ mode: 'full', dryRun: false })
      }
    }
    const before = readFileSync(statePath, 'utf8')
    expect(run({ DEPLOY_ENVIRONMENT: 'sandbox' }).status).not.toBe(0)
    expect(run({ DINING_TEST_FAILURE: 'true' }).status).not.toBe(0)
    expect(readFileSync(statePath, 'utf8')).toBe(before)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
