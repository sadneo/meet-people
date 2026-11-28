// Creates the dev account, or makes an existing one match the configured password.
// Pure logic with injected Supabase calls so it can be tested without a running Supabase.
import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { credentialsDir } from './lib/stack.mjs'

const PAGE = 200

// The Android dev APK's login, generated once per stack and kept beside the web development account.
export function androidDevCredentials(projectId, home = homedir()) {
  const directory = credentialsDir(projectId, home), file = join(directory, 'android-dev-account.json')
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
  const credentials = { email: `android-dev-${randomBytes(3).toString('hex')}@example.com`, password: randomBytes(32).toString('base64url') }
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  writeFileSync(file, JSON.stringify(credentials), { mode: 0o600, flag: 'wx' })
  return credentials
}

export async function ensureDevAccount({ admin, signIn, email, password }) {
  const created = await admin.createUser({ email, password, email_confirm: true })
  if (!created.error) return { status: 'created' }
  if (created.error.code !== 'email_exists') return { status: 'error', message: `Could not create the account: ${created.error.message}` }

  // The email is taken: find that account and reset its password.
  let seen = 0
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.listUsers({ page, perPage: PAGE })
    if (error) {
      // The auth service cannot read its own user table. If the account already works there is nothing to reset.
      if (!(await signIn(email, password)).error) return { status: 'already-works' }
      return { status: 'list-failed', message: error.message }
    }
    const users = data?.users ?? []
    seen += users.length
    const match = users.find(user => user.email?.toLowerCase() === email.toLowerCase())
    if (match) {
      const updated = await admin.updateUserById(match.id, { password, email_confirm: true })
      return updated.error ? { status: 'error', message: `Could not reset the password: ${updated.error.message}` } : { status: 'reset' }
    }
    if (users.length < PAGE) break
  }

  // Taken but not in the visible list (for example a deleted account still holding the email).
  // If the password already works there is nothing to fix.
  const attempt = await signIn(email, password)
  if (!attempt.error) return { status: 'already-works' }
  return { status: 'hidden', seen }
}
