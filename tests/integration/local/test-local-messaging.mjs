import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import process from 'node:process'
import console from 'node:console'
import { URL } from 'node:url'

const { fetch } = globalThis

const url = process.env.SUPABASE_URL
const api = 'http://127.0.0.1:3001'
assert.equal(new URL(url).hostname, '127.0.0.1', 'Local Supabase only.')
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, options)
async function rpc(client, name, args) {
  const { data, error } = await client.rpc(name, args)
  assert.ifError(error)
  return data
}
async function actor(letter) {
  const email = `${letter}@example.com`
  // Sign in first so rerunning preserves existing actors and their history.
  const client = createClient(url, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, options)
  let login = await client.auth.signInWithPassword({ email, password: 'password' })
  if (login.error) {
    const created = await admin.auth.admin.createUser({ email, password: 'password', email_confirm: true })
    assert.ifError(created.error)
    login = await client.auth.signInWithPassword({ email, password: 'password' })
  }
  assert.ifError(login.error)
  let account = await rpc(client, 'get_account')
  if (!account.profile) account.profile = { username: `student-${login.data.user.id}`, display_name: `Test ${letter.toUpperCase()}`, bio: 'Local messaging test account', birthdate: null, location_city: null, avatar_url: null, interests: [], availability: [] }
  for (let chapter = account.completed.length; chapter < 4; chapter++) {
    if (chapter === 1) account.profile.interests = ['Coffee']
    if (chapter === 2) account.preferences.intents = ['Meet new people']
    if (chapter === 3) { account.preferences.usual = ['Afternoons']; account.profile.availability = [{ dow: 1, start_time: '12:00:00', end_time: '17:00:00' }] }
    account.completed.push(chapter)
    account = await rpc(client, 'save_account', { account_in: account })
  }
  return { id: login.data.user.id, token: login.data.session.access_token }
}
async function request(user, path, body) {
  const response = await fetch(`${api}/api/conversations${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await response.json()
  assert.equal(response.status, 200, JSON.stringify(data))
  return data
}
async function connect(user, otherId) {
  const response = await fetch(`${api}/api/connections/${otherId}`, { method: 'POST', headers: { Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' }, body: '{}' })
  const data = await response.json()
  assert.equal(response.status, 200, JSON.stringify(data))
  return data
}
const a = await actor('a')
const b = await actor('b')
await connect(a, b.id)
const connection = await connect(b, a.id)
assert.equal(connection.status, 'connected')
const id = connection.conversationId
const outgoing = { body: 'Hi B! This message came through the real local API.', clientRequestId: randomUUID() }
const first = await request(a, `/${id}/messages`, outgoing)
const retry = await request(a, `/${id}/messages`, outgoing)
assert.equal(retry.id, first.id, 'Retry must not duplicate a message.')
const inbox = await request(b, '?page=1')
assert.ok(inbox.conversations.find(row => row.id === id)?.unread_count > 0)
const reply = await request(b, `/${id}/messages`, { body: 'Hi A! Two-way messaging is working.', clientRequestId: randomUUID() })
for (const user of [a, b]) {
  const history = await request(user, `/${id}/messages`)
  assert.ok(history.messages.some(message => message.id === first.id && message.body === outgoing.body), 'Both users must see the sent message.')
  assert.ok(history.messages.some(message => message.id === reply.id), 'Both users must see the reply.')
}
await request(b, `/${id}/read`, { seq: reply.seq })
assert.equal((await request(b, '?page=1')).conversations.find(row => row.id === id)?.unread_count, 0)
const outsider = await admin.auth.admin.createUser({ email: `messaging-outsider-${randomUUID()}@example.test`, password: 'password', email_confirm: true })
assert.ifError(outsider.error)
try {
  const client = createClient(url, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, options)
  const login = await client.auth.signInWithPassword({ email: outsider.data.user.email, password: 'password' })
  assert.ifError(login.error)
  for (const method of ['GET', 'POST']) {
    const response = await fetch(`${api}/api/conversations/${id}/messages`, { method, headers: { Authorization: `Bearer ${login.data.session.access_token}`, 'Content-Type': 'application/json' }, body: method === 'POST' ? JSON.stringify({ body: 'Forbidden', clientRequestId: randomUUID() }) : undefined })
    assert.ok([403, 404].includes(response.status), `Outsider ${method} must be rejected: ${response.status}`)
  }
} finally {
  const removed = await admin.auth.admin.deleteUser(outsider.data.user.id)
  assert.ifError(removed.error)
}
console.log(`PASS: password login, onboarding, connection acceptance, two-way messaging, history, retry deduplication, unread/read state and outsider access rejection.\nAccounts retained: a@example.com / b@example.com; password: password\nOpen http://127.0.0.1:3000/messages/chat?conversation=${id}`)
