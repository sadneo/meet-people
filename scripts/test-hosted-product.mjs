import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { chromium, expect } from '@playwright/test'
import process from 'node:process'
import console from 'node:console'

const { fetch, AbortSignal, URL } = globalThis
const origin = new URL(process.env.HOSTED_URL ?? '')
assert.equal(origin.protocol, 'https:')
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_PUBLISHABLE_KEY, secret = process.env.SUPABASE_SERVICE_ROLE_KEY
assert.ok(url?.startsWith('https://') && key && secret, 'Hosted Auth configuration required')
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const admin = createClient(url, secret, options), users = [], password = randomBytes(24).toString('base64url')
const matching = '/api/matchmaking'
async function api(actor, path, method = 'GET', body, expected = 200) {
  const headers = { Authorization: `Bearer ${actor.token}` }
  if (body !== undefined) headers['Content-Type'] = Buffer.isBuffer(body) ? 'image/jpeg' : 'application/json'
  const response = await fetch(new URL(path, origin), { method, headers, body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body), signal: AbortSignal.timeout(30000) })
  assert.equal(response.status, expected, `${method} ${path.split('?')[0]} returned ${response.status}`)
  return response.headers.get('content-type')?.includes('application/json') ? response.json() : response.arrayBuffer()
}
try {
  for (let index = 0; index < 2; index++) {
    const email = `product-check-${randomUUID()}@example.test`
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    assert.ifError(created.error)
    const actor = { id: created.data.user.id, email, client: createClient(url, key, options), token: '' }; users.push(actor)
    const signed = await actor.client.auth.signInWithPassword({ email, password })
    assert.ifError(signed.error); actor.token = signed.data.session.access_token
    let account = await api(actor, matching + '/account')
    assert.equal(account.profile, null)
    account.profile = { username: `check-${randomUUID()}`, display_name: `Deployment Check ${index + 1}`, bio: 'Disposable deployment verification', avatar_url: null, birthdate: null, location_city: null, interests: [], availability: [] }
    for (let chapter = 0; chapter < 4; chapter++) {
      if (chapter === 1) account.profile.interests = ['Coffee', 'Hiking', 'Music']
      if (chapter === 2) account.preferences.intents = ['Activity partners']
      if (chapter === 3) {
        account.profile.birthdate = '2000-01-01'; account.profile.location_city = 'Stony Brook University'
        account.profile.availability = [{ dow: 1, start_time: '12:00:00', end_time: '17:00:00' }]
        account.preferences.distance = 'Nearby'; account.preferences.group = 'Either'
      }
      account.completed = Array.from({ length: chapter + 1 }, (_, i) => i)
      account = await api(actor, matching + '/account', 'PUT', account)
      assert.deepEqual(account.completed, Array.from({ length: chapter + 1 }, (_, i) => i))
    }
    assert.deepEqual(await api(actor, matching + '/account'), account)
    const details = await api(actor, matching + '/detailed-settings')
    await api(actor, matching + '/detailed-settings', 'PUT', { expectedRevision: details.revision, settings: { messages: true, plans: false, matches: true, friendsDiscovery: true, datingDiscovery: true } })
    const places = await api(actor, matching + '/search-locations/places?q=Stony%20Brook')
    assert.ok(places.places.length)
    for (const mode of ['friends', 'dating']) {
      const receipt = await api(actor, matching + '/search-locations/resolve', 'POST', { requestId: randomUUID(), mode, source: 'temporary', placeId: places.places[0].id })
      assert.equal(receipt.usable, true)
      const search = { ageMin: 18, ageMax: 99, radiusMiles: 15, searchArea: { source: 'temporary', areaLabel: receipt.areaLabel, resolvedLocationRef: receipt.id } }
      if (mode === 'friends') {
        const previous = await api(actor, matching + '/friends-search-preferences')
        await api(actor, matching + '/friends-search-preferences', 'PUT', { expectedRevision: previous.revision, preferences: { ...search, goals: [] } })
        assert.equal((await api(actor, matching + '/friends-search-preferences/runtime')).canJoin, true)
      } else {
        const previous = await api(actor, matching + '/dating-preferences')
        const profile = { ...previous.profile, gender: index ? 'Woman' : 'Man', sexuality: 'Straight', intent: 'Long-term relationship', style: 'Monogamy' }
        const saved = await api(actor, matching + '/dating-preferences', 'PUT', { expectedProfileRevision: previous.profileRevision, expectedSearchRevision: previous.searchRevision, profile, search })
        const enabled = await api(actor, matching + '/dating/enabled', 'PUT', { expectedProfileRevision: saved.profileRevision, expectedSearchRevision: saved.searchRevision, enabled: true })
        assert.equal(enabled.aggregate.effectiveEnabled, true)
      }
    }
    const state = await api(actor, matching + '/profile-photo')
    const image = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#dceacc' } }).jpeg().toBuffer()
    const uploaded = await api(actor, `${matching}/profile-photo?expectedRevision=${state.revision}&requestId=${randomUUID()}`, 'PUT', image)
    assert.equal(uploaded.hasPhoto, true)
    assert.ok((await api(actor, `${matching}/profile-photo/${actor.id}/${uploaded.revision}`)).byteLength > 0)
    await api(actor, matching + '/profile-details')
    await api(actor, matching + '/safety/blocks')
  }
  const [a, b] = users
  // All positive candidates must be these explicitly provisioned disposable users.
  for (const actor of users) assert.equal((await api(actor, matching + '/queue', 'POST', { mode: 'active' })).mode, 'active')
  assert.equal((await api(a, matching + '/result')).candidate.id, b.id)
  assert.equal((await api(b, matching + '/result')).candidate.id, a.id)
  for (const actor of users) await api(actor, matching + '/queue', 'DELETE')
  assert.equal((await api(a, matching + '/dating/candidate', 'POST', { excludedIds: [] })).candidate.id, b.id)
  assert.equal((await api(a, matching + `/dating/requests/${b.id}`, 'POST', {})).status, 'sent')
  assert.equal((await api(b, '/api/connections')).incoming[0].id, a.id)
  const connected = await api(b, `/api/connections/${a.id}/accept`, 'POST', {})
  assert.equal(connected.status, 'connected'); assert.ok(connected.conversationId)
  const chat = `/api/conversations/${connected.conversationId}`
  const request = { body: 'Disposable deployment check', clientRequestId: randomUUID() }
  const message = await api(a, chat + '/messages', 'POST', request)
  assert.deepEqual(await api(a, chat + '/messages', 'POST', request), message)
  assert.equal((await api(b, chat + '/messages')).messages[0].body, request.body)
  await api(b, chat + '/read', 'POST', { seq: message.seq })
  assert.equal((await api(a, '/api/conversations')).conversations[0].id, connected.conversationId)
  const own = await api(a, matching + '/account'), other = await api(b, matching + '/account')
  assert.notEqual(own.profile.username, other.profile.username)
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH })
    try {
      const page = await browser.newPage()
      page.setDefaultTimeout(20000)
      await page.goto(new URL('/login', origin).href)
      await page.getByLabel('Email', { exact: true }).fill(a.email)
      await page.getByRole('button', { name: 'Continue with email', exact: true }).click()
      await page.getByLabel('Password', { exact: true }).fill(password)
      await page.getByRole('button', { name: 'Sign in', exact: true }).click()
      await expect(page).toHaveURL(origin.href)
      await page.goto(new URL('/messages', origin).href)
      await expect(page.getByText(b.email)).toHaveCount(0)
      await expect(page.getByText(other.profile.display_name, { exact: true }).first()).toBeVisible()
      await page.reload()
      await expect(page.getByText(other.profile.display_name, { exact: true }).first()).toBeVisible()
      console.info('PASS: real browser email/password login, authenticated inbox and reload.')
    } finally { await browser.close() }
  }
  await api(a, matching + `/safety/blocks/${b.id}`, 'PUT', {})
  await api(b, chat + '/messages', 'POST', { body: 'Blocked check', clientRequestId: randomUUID() }, 403)
  console.info('PASS: real hosted Auth, four onboarding saves/readback, profile/settings, trusted locations, Friends/Dating candidates, request/accept, persisted chat/send/read/idempotency, private photos, and reverse-block rejection.')
} finally {
  for (const user of users) {
    const result = await admin.auth.admin.deleteUser(user.id)
    assert.ifError(result.error)
  }
  console.info('Disposable hosted accounts removed.')
}
