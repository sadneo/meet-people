import { mkdir, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from 'vite'
import { emptyAccount, SaveAccountSchema } from '../shared/account.js'

const accountId = 'd0000000-0000-4000-8000-000000000001'
const email = 'pebble-development@example.test'
const marker = 'local-development-v1'

export async function provisionDevelopmentAccount(existing?: { accountId: string; email: string; password: string; url: string; publicKey: string }) {
  const env = { ...loadEnv('development', process.cwd(), ''), ...process.env }
  const url = env.SUPABASE_URL
  if (!url || new URL(url).origin !== 'http://127.0.0.1:54321' || new URL(url).pathname !== '/' || new URL(url).search || new URL(url).hash || new URL(url).username || new URL(url).password || !env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_PUBLISHABLE_KEY) throw new Error('Local Supabase configuration required')
  if (existing && (existing.accountId !== accountId || existing.email !== email || existing.url !== url)) throw new Error('Unexpected development identity')
  const credentials = existing ?? { accountId, email, password: randomBytes(32).toString('base64url'), url, publicKey: env.SUPABASE_PUBLISHABLE_KEY }
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: ((input, init) => {
    if (new URL(String(input)).origin !== 'http://127.0.0.1:54321') throw new Error('Nonlocal provisioning refused')
    return fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(5000) })
  }) as typeof fetch } }
  const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, options)
  const found = await admin.auth.admin.getUserById(accountId)
  if (found.error && found.error.status !== 404) throw found.error
  if (found.data.user && (found.data.user.email !== email || found.data.user.app_metadata.pebble_development !== marker)) throw new Error('Reserved identity is not a development account')
  if (!existing && found.data.user) throw new Error('Existing development credentials missing; account preserved')
  if (!existing) {
    const directory = join(homedir(), '.local/share/pebble')
    await mkdir(directory, { recursive: true, mode: 0o700 })
    await writeFile(join(directory, 'development-account.json'), JSON.stringify(credentials), { mode: 0o600, flag: 'wx' })
  }
  if (!found.data.user) {
    const created = await admin.auth.admin.createUser({ id: accountId, email, password: credentials.password, email_confirm: true, app_metadata: { pebble_development: marker } })
    if (created.error) throw created.error
  }
  const actor = createClient(url, credentials.publicKey, options)
  const signed = await actor.auth.signInWithPassword({ email, password: credentials.password })
  if (signed.error || signed.data.user?.id !== accountId) throw new Error('Development sign-in failed')
  const current = await actor.rpc('get_account')
  if (current.error) throw current.error
  if (!current.data?.profile || (current.data.completed?.length ?? 0) < 4) {
    const account = SaveAccountSchema.parse({ ...emptyAccount,
      profile: { username: 'pebble_development', display_name: 'Development User', bio: 'Local development account', avatar_url: null, interests: ['Coffee', 'Art', 'Music'], birthdate: '2000-01-01', location_city: 'Stony Brook', availability: [{ dow: 1, start_time: '09:00:00', end_time: '17:00:00' }] },
      preferences: { intents: ['Make friends'], usual: ['Afternoons'], distance: 'Nearby', group: 'Either' }, completed: [0, 1, 2, 3],
    })
    const count = Math.min(4, (current.data?.completed?.length ?? 0) + 1)
    const saved = await actor.rpc('save_account', { account_in: { ...account, completed: account.completed.slice(0, count) } })
    if (saved.error) throw saved.error
  }
  return credentials
}
