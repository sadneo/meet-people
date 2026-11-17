// @vitest-environment node
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { expect, it } from 'vitest'

it('verifies native cron before retiring only the known Google job, without logging credentials', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pebble-dining-deployment-test-'))
  const statePath = join(directory, 'state.json')
  try {
    writeFileSync(join(directory, 'pnpm'), `#!/usr/bin/env node
const fs=require('node:fs'),args=process.argv.slice(2),file=args[args.indexOf('--file')+1];
if (!args.includes('wacgxhsdhrqigrmqaonc') || (fs.statSync(file).mode & 0o777)!==0o600) process.exit(2);
const sql=fs.readFileSync(file,'utf8');
if (!sql.includes('hosting_private.configure_dining_schedule()') || sql.includes('decrypted_secret')) process.exit(3);
if (process.env.DINING_TEST_DB_FAILURE) { console.error('private-test-token');process.exit(1); }
console.log(JSON.stringify({rows:[{jobname:'pebble-ingest-dining',schedule:'0 10,11 * * *',command:'select hosting_private.ingest_dining()',active:!process.env.DINING_TEST_INACTIVE}]}));
`, { mode: 0o700 })
    writeFileSync(join(directory, 'gcloud'), `#!/usr/bin/env node
const fs=require('node:fs'),args=process.argv.slice(2),path=process.env.DINING_TEST_STATE;
if (args[3]!=='pebble-ingest-dining-schedule' || !args.includes('--project=cse416-meet-people') || !args.includes('--location=us-east4')) process.exit(2);
if (process.env.DINING_TEST_FAILURE) { console.error('PERMISSION_DENIED private-test-token');process.exit(1); }
if (args[2]==='describe') {
  if (fs.existsSync(path)) {console.error('NOT_FOUND');process.exit(1);}
  console.log(JSON.stringify({httpTarget:{uri:process.env.DINING_TEST_WRONG_TARGET?'https://example.test':'https://wacgxhsdhrqigrmqaonc.supabase.co/functions/v1/ingest-dining',headers:{'x-ingest-token':'private-test-token'}}}));
} else if (args[2]==='delete') {fs.writeFileSync(path,'retired');}
else process.exit(3);
`, { mode: 0o700 })
    const env = { ...process.env, PATH: `${directory}:${process.env.PATH}`, DINING_TEST_STATE: statePath,
      DEPLOY_ENVIRONMENT: 'production', GCP_PROJECT_ID: 'cse416-meet-people', SUPABASE_PROJECT_REF: 'wacgxhsdhrqigrmqaonc',
      SUPABASE_URL: 'https://wacgxhsdhrqigrmqaonc.supabase.co' }
    const run = (script: string, overrides = {}) => spawnSync('node', [`scripts/${script}.mjs`], { env: { ...env, ...overrides }, encoding: 'utf8' })
    for (const overrides of [{DEPLOY_ENVIRONMENT:'sandbox'}, {SUPABASE_PROJECT_REF:'wixdiotkntapwrbibaom'},
      {DINING_TEST_DB_FAILURE:'true'}, {DINING_TEST_INACTIVE:'true'}, {DINING_TEST_WRONG_TARGET:'true'}, {DINING_TEST_FAILURE:'true'}]) {
      const result=run('retire-google-dining-schedule',overrides)
      expect(result.status).not.toBe(0)
      expect(result.stdout+result.stderr).not.toContain('private-test-token')
      expect(existsSync(statePath)).toBe(false)
    }
    // Native reconciliation needs no working Google login.
    expect(run('deploy-dining-schedules',{DINING_TEST_FAILURE:'true'}).status).toBe(0)
    expect(existsSync(statePath)).toBe(false)
    for (let attempt=0;attempt<2;attempt++) {
      const result=run('retire-google-dining-schedule')
      expect(result.status,result.stderr).toBe(0)
      expect(result.stdout+result.stderr).not.toContain('private-test-token')
      expect(readFileSync(statePath,'utf8')).toBe('retired')
    }
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
