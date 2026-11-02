import type { WorkerDiagnostic } from '../api/event-group-worker.js'

const stages = {
  runtime: ['runtime', 'Check command arguments and run pnpm run doctor.'],
  database: ['local_database', 'Check Docker and the owned local Supabase project with pnpm run doctor. Doctor starts nothing.'],
  configuration: ['local_configuration', 'Check pnpm exec supabase status and the loopback API on port 54321. Do not share its keys or raw output.'],
  credentials: ['private_credentials', 'Check the fixed ~/.local/share/pebble/event-group-worker.json file: owner-only 0600, regular non-symlink, valid contents. Do not delete or publish it.'],
  identity: ['worker_identity', 'Check local Auth availability and existing worker identity ownership. Do not replace its identity or reset its password to bypass this check.'],
  provisioning: ['worker_provisioning', 'Account creation may already have succeeded. Inspect the existing marked worker identity before explicitly restarting; do not delete credentials or create a replacement.'],
  policySetup: ['policy_setup', 'Local SQL setup was rejected or could not be confirmed. Inspect schema/job state before explicitly rerunning setup; no rollback is implied. See docs/demo-data.md.'],
  workerSetup: ['worker_setup', 'Worker registration or enabling could not be confirmed. Inspect existing local worker/settings state before explicitly rerunning setup. No rollback is implied.'],
  policyCheck: ['matching_policy', 'The local matching policy is absent or its read check failed. Check database readiness and docs/demo-data.md before explicitly running setup. Do not reset the database.'],
  authentication: ['worker_authentication', 'Check local Auth availability and existing private worker credentials. No automatic login retry or password reset was attempted.'],
  transport: ['worker_transport', 'Check local API availability and public-key configuration with pnpm run doctor. No scoring retry was attempted.'],
  personalCycle: ['development_queue', 'A development-account cycle stopped. Inspect existing jobs, leases and proposals before restarting or explicitly rejoining. Do not replay scoring/completion.'],
  generalCycle: ['general_queue', 'A general queue cycle stopped. Inspect existing jobs, leases and proposals before restarting or explicitly rejoining. Do not replay scoring/completion.'],
} as const
export type LocalWorkerStage = keyof typeof stages

export function localWorkerFailure(stage: LocalWorkerStage) {
  const [code, guidance] = Object.hasOwn(stages, stage) ? stages[stage] : stages.runtime
  return `Local group worker stopped [${code}]. ${guidance} No credentials printed; no automatic replay.`
}

export function workerDiagnosticMessage(diagnostic: WorkerDiagnostic) {
  // Validate even at runtime: never interpolate untrusted values or attached fields.
  const stage = ['configuration', 'transport', 'claim', 'rank', 'fail', 'complete', 'reconcile'].includes(diagnostic.stage) ? diagnostic.stage : 'unknown'
  const reason = ['timeout', 'invalid_response', 'request_failed'].includes(diagnostic.reason) ? diagnostic.reason : 'unknown'
  return `Worker diagnostic: stage=${stage}; reason=${reason}. Outcomes may be uncertain; no automatic replay.`
}
