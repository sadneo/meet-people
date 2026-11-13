import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import console from 'node:console'

const projectRef = 'wacgxhsdhrqigrmqaonc'
const maxAgeMs = 24 * 60 * 60 * 1000
// A recent managed recovery point is a prerequisite, not proof of recoverability.
export function checkRecovery(inventory, now = Date.now()) {
  if (!inventory || !Array.isArray(inventory.backups)) throw new Error('Invalid backup inventory; production deployment blocked.')
  const fresh = timestamp => Number.isFinite(timestamp) && timestamp <= now && now - timestamp <= maxAgeMs
  const backup = inventory.backups.find(item => item && ['COMPLETED', 'completed'].includes(item.status) && fresh(Date.parse(item.inserted_at)))
  const physical = inventory.physical_backup_data
  const earliest = Number(physical?.earliest_physical_backup_date_unix) * 1000
  const latest = Number(physical?.latest_physical_backup_date_unix) * 1000
  if (inventory.pitr_enabled === true && earliest > 0 && earliest <= latest && fresh(latest)) return { method: 'PITR', recoveryPoint: new Date(latest).toISOString() }
  if (backup) return { method: 'managed backup', recoveryPoint: new Date(backup.inserted_at).toISOString() }
  throw new Error('No verified managed recovery point within 24 hours. Production deployment blocked; configure recovery and complete a restore drill. No backup or restore was initiated.')
}

export function evaluateRecoveryPolicy(env, inventory) {
  if (env.DEPLOY_ENVIRONMENT !== 'production' || env.SUPABASE_PROJECT_REF !== projectRef) throw new Error('Recovery gate requires the explicit production environment and project.')
  const policy = env.PRODUCTION_RECOVERY_POLICY ?? 'require-managed-backup'
  if (policy === 'early-access-no-backups') return { method: 'accepted early-access risk', recoveryVerified: false, note: 'Managed backups deferred by operator. Data loss may be unrecoverable. Re-enable managed recovery before leaving early access.' }
  if (policy !== 'require-managed-backup') throw new Error('Unknown production recovery policy; deployment blocked.')
  return { ...checkRecovery(inventory()), recoveryVerified: true, note: 'Recovery-point metadata verified; restore drill and recovery approval remain separate requirements.' }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = evaluateRecoveryPolicy(process.env, () => JSON.parse(execFileSync('pnpm', ['exec', 'supabase', 'backups', 'list', '--project-ref', projectRef], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 2 * 1024 * 1024,
  })))
  if (!result.recoveryVerified) console.warn('::warning::Early access: no verified recovery point. Production data loss may be unrecoverable.')
  console.info(JSON.stringify({ projectRef, ...result }))
}
