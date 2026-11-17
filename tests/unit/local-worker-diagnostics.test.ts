import { expect, it, vi } from 'vitest'
import { localWorkerFailure, workerDiagnosticMessage, type LocalWorkerStage } from '../../scripts/local-worker-diagnostics'
import type { WorkerDiagnostic } from '../../api/event-group-worker'

vi.mock('../../scripts/lib/stack.mjs', async importOriginal => (await import('./hermetic-stack')).hermeticStack(await importOriginal<typeof import('../../scripts/lib/stack.mjs')>()))

it.each<LocalWorkerStage>(['runtime', 'database', 'configuration', 'credentials', 'identity', 'provisioning', 'policySetup', 'workerSetup', 'policyCheck', 'authentication', 'transport', 'personalCycle', 'generalCycle'])('has actionable, redacted guidance for %s', stage => {
  const text = localWorkerFailure(stage)
  expect(text).toMatch(/stopped \[[a-z_]+\]/)
  expect(text).toContain('No credentials printed; no automatic replay.')
  expect(text).not.toContain('reset the database to')
})
it('names the current stack\'s worker credential file, or generic text without a stack', () => {
  vi.stubEnv('PEBBLE_SUPABASE_PROJECT_ID', 'meet-people-wt-unit'); vi.stubEnv('PEBBLE_SUPABASE_URL', 'http://127.0.0.1:55321')
  expect(localWorkerFailure('credentials')).toMatch(/[\\/]\.local[\\/]share[\\/]pebble[\\/]meet-people-wt-unit[\\/]event-group-worker\.json/)
  vi.stubEnv('PEBBLE_SUPABASE_PROJECT_ID', ''); vi.stubEnv('PEBBLE_SUPABASE_URL', '')
  expect(localWorkerFailure('credentials')).not.toContain('<credentialsDir>')
  vi.unstubAllEnvs()
})
it('keeps uncertain queue recovery explicit instead of recommending automatic restarts or rejoining', () => {
  for (const stage of ['personalCycle', 'generalCycle'] as const) {
    expect(localWorkerFailure(stage)).toContain('Inspect existing jobs, leases and proposals before restarting or explicitly rejoining.')
    expect(localWorkerFailure(stage)).toContain('Do not replay scoring/completion.')
  }
  expect(localWorkerFailure('provisioning')).toContain('may already have succeeded')
  expect(localWorkerFailure('policySetup')).toContain('no rollback is implied')
})
it('ignores unknown stage/reason values and arbitrary attached error, token and identity fields', () => {
  const untrusted = { stage: 'PRIVATE_SENTINEL', reason: 'PRIVATE_TOKEN', error: 'PRIVATE_PASSWORD', jobId: 'PRIVATE_ID' } as unknown as WorkerDiagnostic
  expect(workerDiagnosticMessage(untrusted)).toBe('Worker diagnostic: stage=unknown; reason=unknown. Outcomes may be uncertain; no automatic replay.')
  expect(localWorkerFailure('PRIVATE_SENTINEL' as LocalWorkerStage)).toBe(localWorkerFailure('runtime'))
  expect(localWorkerFailure('__proto__' as LocalWorkerStage)).toBe(localWorkerFailure('runtime'))
})
