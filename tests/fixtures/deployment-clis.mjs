// Preload in the deployment test subprocess so CLI resolution never reaches the host.
import assert from 'node:assert/strict'
import childProcess from 'node:child_process'
import { readFileSync, statSync, writeSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import process from 'node:process'

childProcess.spawnSync = (command, args) => {
  assert.equal(command, 'gcloud')
  if (args[0] === 'scheduler' && args[1] === 'jobs' && args[2] === 'describe') {
    return { status: 1, stderr: 'NOT_FOUND' }
  }
  assert.deepEqual(args.slice(0, 3), ['iam', 'service-accounts', 'describe'])
  return { status: 0, stdout: args[3] }
}

childProcess.execFileSync = (command, args) => {
  if (command === 'gcloud') {
    writeSync(1, args.join(' ') + '\n')
    return
  }
  assert.equal(command, 'pnpm')
  assert.deepEqual(args.slice(0, 7), ['exec', 'supabase', 'db', 'query', '--linked', '--project-ref', process.env.SUPABASE_PROJECT_REF])
  const file = args[args.indexOf('--file') + 1]
  if (process.platform !== 'win32') assert.equal(statSync(file).mode & 0o777, 0o600)
  const sql = readFileSync(file, 'utf8')
  assert.ok(sql.includes('cron.alter_job(jobid, active := false)'))
  assert.ok(!sql.includes('configure_dining_schedule'))
  assert.ok(!sql.includes('decrypted_secret'))
  if (process.env.DINING_TEST_DB_FAILURE) throw new Error('private-test-token')
  const rows = process.env.DINING_TEST_ABSENT ? [] : [{
    jobname: 'pebble-ingest-dining', active: Boolean(process.env.DINING_TEST_ACTIVE),
  }]
  return JSON.stringify({ rows })
}

syncBuiltinESMExports()
