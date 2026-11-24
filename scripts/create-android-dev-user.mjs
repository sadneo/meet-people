// Creates (or resets) the account that the Android dev "skip login" button signs in as, on this worktree's
// local Supabase. Its email and password are generated once per stack by androidDevCredentials. Local only.
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { androidDevCredentials, ensureDevAccount } from './dev-account.mjs'
import { credentialsDir, requireStack, stackKeys } from './lib/stack.mjs'

const stack = requireStack()
let keys
try { keys = stackKeys(stack) } catch { console.error('Local Supabase for this worktree is not running. Run pnpm dev:mobile first.'); process.exit(1) }
const { email, password } = androidDevCredentials(stack.projectId)
const file = join(credentialsDir(stack.projectId), 'android-dev-account.json')
const studioUrl = `Supabase Studio (http://127.0.0.1:${stack.ports.studio})`

const client = createClient(keys.apiUrl, keys.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
const result = await ensureDevAccount({ admin: client.auth.admin, signIn: (e, p) => client.auth.signInWithPassword({ email: e, password: p }), email, password })
const newEmail = `  1. Delete ${file} so a new email is generated, then rerun pnpm android --dev; or`

switch (result.status) {
  case 'created': console.log(`Created Android dev account ${email}.`); break
  case 'reset': console.log(`Android dev account ${email} already existed; password reset to match ${file}.`); break
  case 'already-works': console.log(`Android dev account ${email} already exists and its password matches. Nothing to do.`); break
  case 'hidden':
    console.error(`The email ${email} is taken, but no account with it appears in the user list (${result.seen} users checked), and the stored password does not work.`)
    console.error('Most likely a deleted account still holds the email. Either:')
    console.error(newEmail)
    console.error(`  2. Open ${studioUrl} -> SQL Editor and run:`)
    console.error(`       select id, email, deleted_at from auth.users where email ilike '%${email.split('@')[0]}%';`)
    console.error("     then remove the stale row (local database only): delete from auth.users where id = '<that id>';")
    process.exit(1)
    break
  case 'list-failed':
    console.error(`The email ${email} is already taken, but Supabase could not read its user list ("${result.message}"), so the account could not be reset.`)
    console.error('This usually means seeded users have empty (NULL) token columns that the auth service cannot read. Either:')
    console.error(newEmail)
    console.error(`  2. Run scripts/fix-local-auth-tokens.sql in ${studioUrl} -> SQL Editor, then rerun this.`)
    console.error(`To see the real database error: docker logs supabase_auth_${stack.projectId} --tail 40`)
    process.exit(1)
    break
  default: console.error(result.message); process.exit(1)
}
