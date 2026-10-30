// Creates (or resets) the account that the Android dev "skip login" button signs in as.
// Reads SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from the environment (.env.local) and the account's
// email and password from .env.android-dev, so there is one source of truth. Local Supabase only.
import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { createClient } from '@supabase/supabase-js'
import { ensureDevAccount } from './dev-account.mjs'

const file = '.env.android-dev'
if (!existsSync(file)) { console.error(`Missing ${file}. See docs/ANDROID-DEV-MODE.md.`); process.exit(1) }
const dev = parseEnv(readFileSync(file, 'utf8'))
const email = dev.VITE_DEV_LOGIN_EMAIL, password = dev.VITE_DEV_LOGIN_PASSWORD
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!email || !password) { console.error(`${file} needs VITE_DEV_LOGIN_EMAIL and VITE_DEV_LOGIN_PASSWORD.`); process.exit(1) }
if (!url || !key) { console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (run pnpm env:local first).'); process.exit(1) }

const host = new URL(url).hostname
const local = host === 'localhost' || host === '127.0.0.1' || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)
if (!local) { console.error(`Refusing to create a dev account on ${host}. This script only works against a local Supabase.`); process.exit(1) }

const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const result = await ensureDevAccount({ admin: client.auth.admin, signIn: (e, p) => client.auth.signInWithPassword({ email: e, password: p }), email, password })

switch (result.status) {
  case 'created': console.log(`Created dev account ${email}.`); break
  case 'reset': console.log(`Dev account ${email} already existed; password reset to match ${file}.`); break
  case 'already-works': console.log(`Dev account ${email} already exists and its password already matches ${file}. Nothing to do.`); break
  case 'hidden':
    console.error(`The email ${email} is taken, but no account with it appears in the user list (${result.seen} users checked), and the password in ${file} does not work.`)
    console.error('Most likely a deleted account still holds the email. Either:')
    console.error('  1. Set a different VITE_DEV_LOGIN_EMAIL in .env.android-dev (e.g. android-dev-2@example.com), rerun this, then rebuild with pnpm android:dev; or')
    console.error('  2. Open Supabase Studio (http://127.0.0.1:54323) -> SQL Editor and run:')
    console.error(`       select id, email, deleted_at from auth.users where email ilike '%${email.split('@')[0]}%';`)
    console.error("     then remove the stale row (local database only): delete from auth.users where id = '<that id>';")
    process.exit(1)
  case 'list-failed':
    console.error(`The email ${email} is already taken, but Supabase could not read its user list ("${result.message}"), so the account could not be reset.`)
    console.error('This usually means seeded users have empty (NULL) token columns that the auth service cannot read. Either:')
    console.error('  1. Set a different VITE_DEV_LOGIN_EMAIL in .env.android-dev (e.g. android-dev-2@example.com), rerun this, then rebuild with pnpm android:dev; or')
    console.error('  2. Run scripts/fix-local-auth-tokens.sql in Supabase Studio (http://127.0.0.1:54323 -> SQL Editor), then rerun this.')
    const project = existsSync('supabase/config.toml') ? /^project_id\s*=\s*"([^"]+)"/m.exec(readFileSync('supabase/config.toml', 'utf8'))?.[1] : undefined
    console.error(`To see the real database error: docker logs supabase_auth_${project ?? '<project_id>'} --tail 40`)
    process.exit(1)
  default: console.error(result.message); process.exit(1)
}
