import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { URL } from 'node:url'
import console from 'node:console'
import { createClient } from '@supabase/supabase-js'

let status
try { status = execFileSync('sh', ['scripts/supabase.sh', 'status', '--output', 'env'], { encoding: 'utf8', stdio: 'pipe' }) }
catch { throw new Error('Local Supabase status unavailable.') }
const values = Object.fromEntries(status.trim().split('\n').map(line => {
  const [key, value] = line.split(/=(.*)/s, 2)
  return [key, value.replace(/^"|"$/g, '')]
}))
const url = values.API_URL ?? values.SUPA_API_URL
let endpoint
try { endpoint = new URL(url) } catch { throw new Error('Local Supabase URL is invalid.') }
assert.ok(endpoint.protocol === 'http:' && endpoint.hostname === '127.0.0.1' && !endpoint.username && !endpoint.password && endpoint.pathname === '/' && !endpoint.search && !endpoint.hash, 'This check only runs against local Supabase.')
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const client = () => createClient(url, values.PUBLISHABLE_KEY ?? values.ANON_KEY, options)
const admin = createClient(url, values.SERVICE_ROLE_KEY, options)
const ids = []
const password = `${randomUUID()}-Aa1!`
const rpc = async (actor, name, args) => { const { data, error } = await actor.rpc(name, args); if (error) throw error; return data }
// SQL sorts labels/windows; compare exact values without depending on UI order.
// Never deduplicate or discard fields to make a readback appear successful.
const normalized = account => ({ ...account, profile: account.profile ? { ...account.profile,
  interests: [...account.profile.interests].sort(),
  availability: [...account.profile.availability].sort((a, b) => a.dow - b.dow || a.start_time.localeCompare(b.start_time) || a.end_time.localeCompare(b.end_time)),
} : null })
const save = async (actor, next) => {
  const expected = normalized(JSON.parse(JSON.stringify(next)))
  const saved = await rpc(actor, 'save_account', { account_in: next })
  const confirmed = await rpc(actor, 'get_account')
  assert.deepEqual(normalized(saved), expected, 'Save response did not preserve the submitted account.')
  assert.deepEqual(normalized(confirmed), expected, 'Authoritative account readback differs from the submitted account.')
  return confirmed
}
let stage = 'signup'
let failure = null
let cleanupFailures = 0
try {
  const a = client(), b = client()
  const users = []
  for (const actor of [a, b]) {
    stage = 'signup'
    const email = `smoke-${randomUUID()}@example.test`
    const { data, error } = await actor.auth.signUp({ email, password })
    if (error) throw error
    assert.ok(data.user)
    ids.push(data.user.id)
    stage = 'local email-confirmation policy'
    assert.equal(data.session, null, 'Local email confirmation should be enabled; restart Supabase after changing auth config.')
    // Confirm out-of-band without requiring a human to open Mailpit.
    stage = 'email confirmation'
    const confirmed = await admin.auth.admin.updateUserById(data.user.id, { email_confirm: true })
    if (confirmed.error) throw confirmed.error
    stage = 'initial password login'
    const signed = await actor.auth.signInWithPassword({ email, password })
    if (signed.error) throw signed.error
    assert.ok(signed.data.session)
    assert.equal(signed.data.session.user.id, data.user.id)
    users.push({ email, id: data.user.id })
  }
  let account = await rpc(a, 'get_account')
  assert.equal(account.profile, null)
  assert.deepEqual(account.completed, [])
  account.profile = { username: `student-${users[0].id}`, display_name: 'Smoke Student', bio: 'My own profile', birthdate: null, location_city: null, avatar_url: null, interests: [], availability: [] }
  for (let chapter = 0; chapter < 4; chapter++) {
    stage = `chapter ${chapter + 1}`
    if (chapter === 1) account.profile.interests = ['Music', 'Coffee', 'Art']
    if (chapter === 2) account.preferences.intents = ['Meet new people']
    if (chapter === 3) {
      account.profile.birthdate = '2001-02-03'
      account.profile.location_city = 'Synthetic campus'
      account.profile.availability = [{ dow: 1, start_time: '12:00:00', end_time: '17:00:00' }]
      account.preferences.distance = 'Nearby'
      account.preferences.group = 'Either'
    }
    account.completed.push(chapter)
    account = await save(a, account)
    assert.deepEqual(account.completed, Array.from({ length: chapter + 1 }, (_, index) => index))
  }
  stage = 'persisted edit and isolation'
  account.settings.notifications = false
  account.profile.bio = 'Persisted edit'
  account = await save(a, account)
  const ownRows = await a.from('account_settings').select('user_id,settings')
  if (ownRows.error) throw ownRows.error
  assert.equal(ownRows.data.length, 1)
  assert.equal(ownRows.data[0].user_id, users[0].id)
  assert.deepEqual(ownRows.data[0].settings, account.settings)
  const other = await rpc(b, 'get_account')
  assert.equal(other.profile, null)
  assert.deepEqual(other.completed, [])
  const privateRows = await b.from('account_settings').select('*')
  if (privateRows.error) throw privateRows.error
  assert.deepEqual(privateRows.data, [])
  const overwrite = await b.from('account_settings').update({ settings: account.settings }).eq('user_id', users[0].id)
  assert.ok(overwrite.error, 'Browser roles cannot write private settings directly.')
  const skipped = await b.rpc('save_account', { account_in: account })
  assert.ok(skipped.error, 'A new account cannot skip onboarding steps.')
  assert.deepEqual(await rpc(b, 'get_account'), other, 'Rejected onboarding must leave the second account unchanged.')
  stage = 'logout and password login'
  const logout = await a.auth.signOut()
  if (logout.error) throw logout.error
  const signed = await a.auth.signInWithPassword({ email: users[0].email, password })
  if (signed.error) throw signed.error
  assert.equal(signed.data.session.user.id, users[0].id)
  assert.deepEqual(await rpc(a, 'get_account'), account)
  assert.equal(account.profile.avatar_url, null)
  const anonymous = await client().rpc('get_account')
  assert.ok(anonymous.error)
  stage = 'password recovery'
  const recovery = await admin.auth.admin.generateLink({ type: 'recovery', email: users[0].email })
  if (recovery.error) throw recovery.error
  const recovered = client()
  const verified = await recovered.auth.verifyOtp({ token_hash: recovery.data.properties.hashed_token, type: 'recovery' })
  if (verified.error) throw verified.error
  assert.equal(verified.data.session.user.id, users[0].id)
  const updated = await recovered.auth.updateUser({ password: `${password}-updated` })
  if (updated.error) throw updated.error
  const recoveredLogout = await recovered.auth.signOut()
  if (recoveredLogout.error) throw recoveredLogout.error
  const relogin = await recovered.auth.signInWithPassword({ email: users[0].email, password: `${password}-updated` })
  if (relogin.error) throw relogin.error
  assert.equal(relogin.data.session.user.id, users[0].id)
  assert.deepEqual(await rpc(recovered, 'get_account'), account)
  const signedOut = await Promise.all([a, b, recovered].map(actor => actor.auth.signOut()))
  assert.ok(signedOut.every(result => !result.error), 'Final signout failed.')
} catch (error) {
  // SDK/process diagnostics can contain credentials or token-bearing URLs.
  const code = typeof error?.code === 'string' && /^[a-z0-9_]{1,80}$/i.test(error.code) ? error.code : 'unknown'
  const status = Number.isInteger(error?.status) ? error.status : 'unknown'
  failure = new Error(`Local Auth acceptance failed at ${stage} (code: ${code}, status: ${status}).`)
} finally {
  for (const id of ids) {
    try { const { error } = await admin.auth.admin.deleteUser(id); if (error) cleanupFailures++ }
    catch { cleanupFailures++ }
  }
}
if (cleanupFailures) throw new Error(`Cleanup failed for ${cleanupFailures} generated test user(s); all recorded deletions were attempted.${failure ? ` Acceptance also failed at ${stage}.` : ''}`)
if (failure) throw failure
console.log('Passed: password auth/recovery, four persisted onboarding chapters/readback, returning account, optional photo, private settings and account isolation; generated users removed.')
