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
const failures = []
const api = process.env.EVENTS_TEST_API_URL ?? 'http://127.0.0.1:3101'
const eventPath = `/api/events/${eventId}`
const category = `Integration ${eventId}`
async function request(path) {
  const response = await globalThis.fetch(`${api}${path}`)
  const data = await response.json()
  assert.equal(response.status, 200, JSON.stringify(data))
  return data
}
try {
  const listing = await admin.from('listings').insert({ id: eventId, title: 'Disposable events integration check', source: 'test', external_id: eventId, starts_at: new Date(Date.now() + 86400000).toISOString(), category })
  if (listing.error) throw listing.error
  const detail = await request(eventPath)
  assert.equal(detail.id, eventId)
  assert.equal('external_id' in detail, false)
  const list = await request(`/api/events?category=${encodeURIComponent(category)}`)
  assert.deepEqual(list.events.map(event => event.id), [eventId])
  assert.ok(list.categories.includes(category))
  // The event company feature is retired.
  assert.equal((await globalThis.fetch(`${api}${eventPath}/company`)).status, 404)
  log('Live public event list, detail, categories, and retired company routes passed.')
} catch (failure) {
  failures.push(failure)
} finally {
  const result = await admin.from('listings').delete().eq('id', eventId)
  if (result.error) failures.push(result.error)
}
if (failures.length) throw new AggregateError(failures, 'Events integration check or fixture cleanup failed.')
