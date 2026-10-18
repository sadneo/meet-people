import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { URL } from 'node:url'
import console from 'node:console'
import { createClient } from '@supabase/supabase-js'

const status = execFileSync('sh', ['scripts/supabase.sh', 'status', '--output', 'env'], { encoding: 'utf8' })
const values = Object.fromEntries(status.trim().split('\n').map(line => {
  const [key, value] = line.split(/=(.*)/s, 2)
  return [key, value.replace(/^"|"$/g, '')]
}))
const url = values.API_URL ?? values.SUPA_API_URL
assert.equal(new URL(url).hostname, '127.0.0.1', 'This check only runs against local Supabase.')
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const client = () => createClient(url, values.PUBLISHABLE_KEY ?? values.ANON_KEY, options)
const admin = createClient(url, values.SERVICE_ROLE_KEY, options)
const ids = []
const password = 'local-smoke-test-password'
const rpc = async (actor, name, args) => { const { data, error } = await actor.rpc(name, args); if (error) throw error; return data }
try {
  const a = client(), b = client()
  assert.equal(await rpc(admin, 'auth_email_exists', { email_in: `missing-${randomUUID()}@example.test` }), false)
  assert.ok((await a.rpc('auth_email_exists', { email_in: 'private@example.test' })).error, 'Anonymous browsers cannot look up accounts.')
  const users = []
  for (const actor of [a, b]) {
    const email = `smoke-${randomUUID()}@example.test`
    const { data, error } = await actor.auth.signUp({ email, password })
    if (error) throw error
    assert.ok(data.user)
    ids.push(data.user.id)
    assert.equal(data.session, null, 'Local email confirmation should be enabled; restart Supabase after changing auth config.')
    // Confirm out-of-band without requiring a human to open Mailpit.
    const confirmed = await admin.auth.admin.updateUserById(data.user.id, { email_confirm: true })
    if (confirmed.error) throw confirmed.error
    const signed = await actor.auth.signInWithPassword({ email, password })
    if (signed.error) throw signed.error
    assert.ok(signed.data.session)
    users.push({ email, id: data.user.id })
    assert.equal(await rpc(admin, 'auth_email_exists', { email_in: ` ${email.toUpperCase()} ` }), true)
    assert.ok((await actor.rpc('auth_email_exists', { email_in: email })).error, 'Authenticated browsers cannot look up accounts either.')
  }
  let account = await rpc(a, 'get_account')
  assert.equal(account.profile, null)
  assert.deepEqual(account.completed, [])
  account.profile = { username: `student-${users[0].id}`, display_name: 'Smoke Student', bio: 'My own profile', birthdate: null, location_city: null, avatar_url: null, interests: [], availability: [] }
  for (let chapter = 0; chapter < 4; chapter++) {
    if (chapter === 1) account.profile.interests = ['Coffee']
    if (chapter === 2) account.preferences.intents = ['Meet new people']
    if (chapter === 3) { account.preferences.usual = ['Afternoons']; account.profile.availability = [{ dow: 1, start_time: '12:00:00', end_time: '17:00:00' }] }
    account.completed.push(chapter)
    account = await rpc(a, 'save_account', { account_in: account })
    assert.equal(account.completed.length, chapter + 1)
  }
  account.settings.notifications = false
  account.profile.bio = 'Persisted edit'
  account = await rpc(a, 'save_account', { account_in: account })
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
  await a.auth.signOut()
  const signed = await a.auth.signInWithPassword({ email: users[0].email, password })
  if (signed.error) throw signed.error
  assert.deepEqual(await rpc(a, 'get_account'), account)
  assert.equal(account.profile.avatar_url, null)
  const anonymous = await client().rpc('get_account')
  assert.ok(anonymous.error)
  const recovery = await admin.auth.admin.generateLink({ type: 'recovery', email: users[0].email })
  if (recovery.error) throw recovery.error
  const recovered = client()
  const verified = await recovered.auth.verifyOtp({ token_hash: recovery.data.properties.hashed_token, type: 'recovery' })
  if (verified.error) throw verified.error
  const updated = await recovered.auth.updateUser({ password: `${password}-updated` })
  if (updated.error) throw updated.error
  await recovered.auth.signOut()
  const relogin = await recovered.auth.signInWithPassword({ email: users[0].email, password: `${password}-updated` })
  if (relogin.error) throw relogin.error
  assert.deepEqual(await rpc(recovered, 'get_account'), account)
  await Promise.all([a, b, recovered].map(actor => actor.auth.signOut()))
  console.log('Passed: password auth/recovery, onboarding saves, returning account, optional photo, private settings and account isolation.')
} finally {
  for (const id of ids) { const { error } = await admin.auth.admin.deleteUser(id); assert.ifError(error) }
}
