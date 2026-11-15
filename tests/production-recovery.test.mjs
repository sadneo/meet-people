import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkRecovery, evaluateRecoveryPolicy } from '../scripts/check-production-recovery.mjs'

const now = Date.parse('2026-11-13T12:00:00Z')
const recent = '2026-11-13T10:00:00Z'
test('empty inventory and WAL-G alone do not grant production permission', () => {
  assert.throws(() => checkRecovery(null, now), /Invalid/)
  assert.throws(() => checkRecovery({ backups: [], walg_enabled: true }, now), /blocked/)
})
test('only a completed and recent managed backup passes', () => {
  const inventory = status => ({ backups: [{ status, inserted_at: recent }] })
  assert.equal(checkRecovery(inventory('COMPLETED'), now).method, 'managed backup')
  for (const status of ['FAILED', 'IN_PROGRESS', 'UNKNOWN']) assert.throws(() => checkRecovery(inventory(status), now), /blocked/)
  for (const date of ['invalid', '2026-11-10T12:00:00Z', '2026-11-14T12:00:00Z']) assert.throws(() => checkRecovery({ backups: [{ status: 'COMPLETED', inserted_at: date }] }, now), /blocked/)
})
test('PITR requires enabled, ordered and recent recovery-window metadata', () => {
  const physical = { earliest_physical_backup_date_unix: now / 1000 - 86400, latest_physical_backup_date_unix: now / 1000 - 60 }
  const inventory = { backups: [], pitr_enabled: true, physical_backup_data: physical }
  assert.equal(checkRecovery(inventory, now).method, 'PITR')
  assert.throws(() => checkRecovery({ ...inventory, pitr_enabled: false }, now), /blocked/)
  assert.throws(() => checkRecovery({ ...inventory, physical_backup_data: {} }, now), /blocked/)
  assert.throws(() => checkRecovery({ ...inventory, physical_backup_data: { ...physical, earliest_physical_backup_date_unix: now / 1000 } }, now), /blocked/)
})
test('early-access exception is explicit, target-checked and never reports verified recovery', () => {
  const env = { DEPLOY_ENVIRONMENT: 'production', SUPABASE_PROJECT_REF: 'wacgxhsdhrqigrmqaonc', PRODUCTION_RECOVERY_POLICY: 'early-access-no-backups' }
  const noLookup = () => { throw new Error('Unexpected provider lookup') }
  assert.equal(evaluateRecoveryPolicy(env, noLookup).recoveryVerified, false)
  assert.throws(() => evaluateRecoveryPolicy({ ...env, SUPABASE_PROJECT_REF: 'sandbox' }, noLookup), /explicit production/)
  assert.throws(() => evaluateRecoveryPolicy({ ...env, PRODUCTION_RECOVERY_POLICY: 'typo' }, noLookup), /Unknown/)
  assert.throws(() => evaluateRecoveryPolicy({ ...env, PRODUCTION_RECOVERY_POLICY: undefined }, () => ({ backups: [] })), /blocked/)
})
test('workflow runs the explicit production policy before hosted mutation steps', async () => {
  const { readFileSync } = await import('node:fs')
  const workflow = readFileSync('.github/workflows/release.yml', 'utf8')
  const gate = workflow.indexOf('run: node scripts/check-production-recovery.mjs')
  assert.ok(gate > 0)
  const step = workflow.slice(workflow.lastIndexOf('      - name:', gate), gate)
  assert.ok(step.includes("if: env.DEPLOY_ENVIRONMENT == 'production'"))
  assert.ok(step.includes('PRODUCTION_RECOVERY_POLICY: early-access-no-backups'))
  for (const step of ['Deploy authenticated Edge Functions', 'node scripts/push-reviewed-migrations.mjs --yes', 'Install canonical product backend', 'pnpm hosting:configure']) assert.ok(gate < workflow.indexOf(step))
})
