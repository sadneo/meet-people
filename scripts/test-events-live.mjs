// Creates disposable local fixtures and removes them even when assertions fail.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import process from 'node:process'
import { log } from 'node:console'

const databaseUrl = process.env.SUPABASE_URL
if (!databaseUrl || !/^http:\/\/(127\.0\.0\.1|localhost):/.test(databaseUrl)) throw new Error('This check requires local Supabase. Run with --env-file=.env.local.')
const admin = createClient(databaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const eventId = randomUUID()
const users = []
const failures = []
const api = process.env.EVENTS_TEST_API_URL ?? 'http://127.0.0.1:3101'
const eventPath = `/api/events/${eventId}`
async function request(path, token, action) {
  const response = await globalThis.fetch(`${api}${path}`, {
    method: action ? 'POST' : 'GET',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(action ? { 'Content-Type': 'application/json' } : {}) },
    body: action ? JSON.stringify({ action, name: 'Test student' }) : undefined,
  })
  const data = await response.json()
  assert.equal(response.status, 200, JSON.stringify(data))
  return data
}
try {
  const listing = await admin.from('listings').insert({ id: eventId, title: 'Disposable events integration check', source: 'test', external_id: eventId, starts_at: new Date(Date.now() + 86400000).toISOString(), category: 'Music' })
  if (listing.error) throw listing.error
  for (let n = 0; n < 2; n++) {
    const password = `${randomUUID()}Aa1!`
    const email = `events-test-${randomUUID()}@example.test`
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (created.error) throw created.error
    users.push({ id: created.data.user.id, token: null })
    const client = createClient(databaseUrl, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const signedIn = await client.auth.signInWithPassword({ email, password })
    if (signedIn.error) throw signedIn.error
    users[n].token = signedIn.data.session.access_token
  }
  assert.equal((await request(eventPath)).id, eventId)
  assert.equal((await globalThis.fetch(`${api}${eventPath}/company`)).status, 401)
  const interested = await request(`${eventPath}/company`, users[0].token, 'interest')
  assert.equal(interested.isInterested, true)
  assert.equal(interested.group, null)
  const waiting = await request(`${eventPath}/company`, users[0].token, 'join')
  assert.equal(waiting.group.members.length, 1)
  const joined = await request(`${eventPath}/company`, users[1].token, 'join')
  assert.equal(joined.group.id, waiting.group.id)
  assert.equal(joined.group.members.length, 2)
  assert.equal((await request(`${eventPath}/company`, users[0].token)).group.members.length, 2)
  assert.equal((await request(`${eventPath}/company`, users[1].token, 'join')).group.members.length, 2)
  assert.equal((await request(`${eventPath}/company`, users[1].token, 'leave')).group, null)
  assert.equal((await request(`${eventPath}/company`, users[0].token)).group.members.length, 1)
  assert.equal((await request(`${eventPath}/company`, users[0].token, 'uninterest')).isInterested, false)
  log('Live events, verified authentication, persistent interest, group formation, repeated join, and leaving passed.')
} catch (failure) {
  failures.push(failure)
} finally {
  for (const user of users) {
    const result = await admin.auth.admin.deleteUser(user.id)
    if (result.error) failures.push(result.error)
  }
  const result = await admin.from('listings').delete().eq('id', eventId)
  if (result.error) failures.push(result.error)
}
if (failures.length) throw new AggregateError(failures, 'Events integration check or fixture cleanup failed.')
