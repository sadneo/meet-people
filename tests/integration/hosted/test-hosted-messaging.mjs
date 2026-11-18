// Opt-in hosted messaging acceptance (production, or sandbox with DEPLOY_ENVIRONMENT=sandbox) using the root .env and generated fixtures.
// Requires the remote test app and logged-in Supabase CLI for scoped SQL cleanup.
import { readFileSync, writeFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import process from 'node:process'
import console from 'node:console'
import { URL } from 'node:url'
import { setTimeout, clearTimeout } from 'node:timers'
import { randomUUID, randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { chromium, expect } from '@playwright/test'
import { setTimeout as delay } from 'node:timers/promises'
import { createClient } from '@supabase/supabase-js'
import { supabaseRefs } from '../../../scripts/configure-deployment.mjs'

const { fetch, AbortSignal } = globalThis

const env = parseEnv(readFileSync('.env', 'utf8'))
const target = new URL(env.SUPABASE_URL)
const origin = new URL(env.VITE_API_BASE_URL)
const environment = process.env.DEPLOY_ENVIRONMENT ?? 'production'
const expectedApi = { production: 'https://pebble.garden', sandbox: 'https://web.dev.pebble.garden' }[environment]
if (!expectedApi || target.origin !== `https://${supabaseRefs[environment]}.supabase.co` || origin.origin !== expectedApi) throw new Error('Unexpected configured target')
const run = randomUUID(), password = randomBytes(28).toString('base64url') + '-Aa1!'
const report = { target: target.host, api: origin.origin, run, checks: [], cleanup: {} }
const users = [], clients = [], conversations = []
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20000) }) },
  realtime: { logger: () => {} } }
const admin = createClient(target.origin, env.SUPABASE_SERVICE_ROLE_KEY, options)
const publicKey = env.SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY
let stage = 'preflight', failed = false, native = false
function requireValue(condition, code) { if (!condition) throw new Error(code) }
function pass(name, detail) { report.checks.push({ name, status: 'pass', ...(detail ? { detail } : {}) }); console.log('PASS:', name) }
function fail(name, detail) { report.checks.push({ name, status: 'fail', detail }); console.log('FAIL:', name, detail); failed = true }
async function rpc(actor, name, args) {
  const result = await actor.client.rpc(name, args)
  requireValue(!result.error, `rpc_${name}_${result.error?.code ?? result.status}`)
  return result.data
}
async function api(actor, path, body, expected = 200) {
  const response = await fetch(new URL(path, origin), { method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${actor.token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) })
  requireValue(response.status === expected, `api_${response.status}_expected_${expected}`)
  return response.json()
}
async function actor(index, onboard = true) {
  const email = `msg-check-${run}-${index}@example.test`
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { messaging_check: run } })
  requireValue(!created.error && created.data.user, `create_test_user_${created.error?.code ?? created.error?.status ?? 'failed'}`)
  const user = { id: created.data.user.id, email, client: createClient(target.origin, publicKey, options), events: [], typing: [] }
  users.push(user); clients.push(user.client)
  const login = await user.client.auth.signInWithPassword({ email, password })
  requireValue(!login.error, `test_login_${login.error?.code ?? login.error?.status}`)
  user.token = login.data.session.access_token
  if (onboard) {
    let account = await rpc(user, 'get_account')
    account.profile = { username: `msg_check_${index}_${run.replaceAll('-', '').slice(0, 16)}`, display_name: `Messaging Check ${index}`,
      bio: 'Temporary messaging verification account', avatar_url: null, birthdate: '2000-01-01', location_city: 'Synthetic test campus', interests: [], availability: [] }
    account.settings.discoverable = false
    for (let chapter = 0; chapter < 4; chapter++) {
      if (chapter === 1) account.profile.interests = ['Music', 'Coffee', 'Art']
      if (chapter === 2) account.preferences.intents = ['Meet new people']
      if (chapter === 3) {
        account.profile.availability = [{ dow: 1, start_time: '12:00:00', end_time: '17:00:00' }]
        account.preferences.distance = 'Nearby'; account.preferences.group = 'Either'
      }
      account.completed = Array.from({ length: chapter + 1 }, (_, i) => i)
      account = await rpc(user, 'save_account', { account_in: account })
    }
    user.account = account
  }
  return user
}
async function discoverable(user, value) {
  user.account.settings.discoverable = value
  user.account = await rpc(user, 'save_account', { account_in: user.account })
}
async function subscription(user, topic) {
  await user.client.realtime.setAuth(user.token)
  return new Promise(resolve => {
    const timeout = setTimeout(() => resolve('TIMEOUT'), 10000)
    user.client.channel(topic, { config: { private: true } })
      .on('broadcast', { event: 'changed' }, event => user.events.push(event.payload))
      .on('broadcast', { event: 'typing' }, event => user.typing.push(event.payload))
      .subscribe(status => {
        if (['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) { clearTimeout(timeout); resolve(status) }
      })
  })
}
async function waitFor(predicate, ms = 5000) {
  for (let elapsed = 0; elapsed < ms; elapsed += 100) { if (predicate()) return true; await delay(100) }
  return predicate()
}
try {
  // Confirm SQL cleanup access before creating any hosted fixtures.
  const cleanupProbe = `/tmp/meet-people-messaging-cleanup-probe-${run}.sql`
  writeFileSync(cleanupProbe,'begin read only; select current_database(); commit;')
  try {
    execFileSync('pnpm',['exec','supabase','db','query','--linked','--project-ref',target.hostname.split('.')[0],'--file',cleanupProbe,'--output','json'],{stdio:'pipe',encoding:'utf8',timeout:30000})
  } catch { throw new Error('Run supabase login before testing; SQL cleanup access is required') }
  const readiness = await fetch('http://127.0.0.1:3302/api/health',{signal:AbortSignal.timeout(5000)})
  requireValue(readiness.status===200,'Start pnpm run dev:remote before this test')
  const shape = await admin.from('conversations').select('id,source_key').limit(0)
  requireValue(!shape.error || ['42703', 'PGRST204'].includes(shape.error.code), `conversation_schema_${shape.error?.code}`)
  native = !shape.error
  stage = 'temporary users and onboarding'
  const a = await actor('a'), b = await actor('b'), outsider = await actor('outsider')
  pass('remote Auth and account onboarding')
  stage = 'test-user connection'
  await discoverable(a, true); await discoverable(b, true)
  await api(a, `/api/connections/${b.id}`, {})
  const connected = await api(b, `/api/connections/${a.id}/accept`, {})
  requireValue(connected.status === 'connected' && connected.conversationId, 'test_connection_not_created')
  const conversation = connected.conversationId; conversations.push(conversation)
  await discoverable(a, false); await discoverable(b, false)
  pass('connection between the two test accounts')
  stage = 'private realtime subscriptions'
  const [aStatus, bStatus] = await Promise.all([subscription(a, `messaging:${a.id}`), subscription(b, `messaging:${b.id}`)])
  if (aStatus === 'SUBSCRIBED' && bStatus === 'SUBSCRIBED') pass('owner private realtime subscriptions')
  else fail('owner private realtime subscriptions', { a: aStatus, b: bStatus })
  const outsiderStatus = await subscription(outsider, `messaging:${b.id}`)
  if (['CHANNEL_ERROR', 'TIMED_OUT'].includes(outsiderStatus)) pass('foreign private channel rejected')
  else fail('foreign private channel rejected', outsiderStatus)
  a.events.length = 0; b.events.length = 0
  stage = 'sending and history'
  const path = `/api/conversations/${conversation}`
  const outgoing = { body: `Temporary remote messaging check ${run}`, clientRequestId: randomUUID() }
  const first = await api(a, path + '/messages', outgoing)
  const retry = await api(a, path + '/messages', outgoing)
  requireValue(first.id === retry.id, 'duplicate_message_on_retry')
  const history = await api(b, path + '/messages')
  requireValue(history.messages.some(message => message.id === first.id && message.body === outgoing.body), 'remote_message_not_in_history')
  requireValue(history.messages.filter(message => message.id === first.id).length === 1, 'duplicate_history')
  pass('send, persisted history and retry deduplication')
  const inbox = await api(b, '/api/conversations?page=1')
  requireValue(inbox.conversations.find(chat => chat.id === conversation)?.unread_count > 0, 'remote_unread_count_missing')
  pass('unread message count')
  if (await waitFor(() => b.events.length > 0)) pass('server-triggered live message notification')
  else fail('server-triggered live message notification', 'No private changed broadcast received')
  a.events.length = 0
  await api(b, path + '/read', { seq: first.seq })
  const receipts = await api(a, path + '/messages')
  requireValue(receipts.participants.find(person => person.id === b.id)?.last_read_seq >= first.seq, 'remote_read_receipt_missing')
  requireValue((await api(b, '/api/conversations?page=1')).conversations.find(chat => chat.id === conversation)?.unread_count === 0, 'unread_count_not_cleared')
  pass('saved read receipt and cleared unread count')
  if (await waitFor(() => a.events.length > 0)) pass('server-triggered live read notification')
  else fail('server-triggered live read notification', 'No private changed broadcast received')
  const reply = await api(b, path + '/messages', { body: `Temporary remote reply ${run}`, clientRequestId: randomUUID() })
  requireValue((await api(a, path + '/messages')).messages.some(message => message.id === reply.id), 'remote_reply_missing')
  pass('two-way replies')
  for (const method of ['GET', 'POST']) {
    const response = await fetch(new URL(path + '/messages', origin), { method, headers: { Authorization: `Bearer ${outsider.token}`, 'Content-Type': 'application/json' },
      body: method === 'POST' ? JSON.stringify({ body: 'Synthetic outsider denial test', clientRequestId: randomUUID() }) : undefined, signal: AbortSignal.timeout(15000) })
    requireValue([403,404].includes(response.status), 'outsider_message_access_not_denied')
  }
  pass('outsider history and send denied')
  stage = 'typing'
  const typing = await a.client.rpc('messaging_typing', { conversation_in: conversation, group_in: false, typing_in: true })
  if (typing.error) fail('typing signal', { code: typing.error.code, status: typing.status })
  else if (await waitFor(() => b.typing.some(event => event.userId === a.id && event.conversationId === conversation && event.typing))) {
    pass('private typing signal')
    await rpc(a, 'messaging_typing', { conversation_in: conversation, group_in: false, typing_in: false })
    requireValue(await waitFor(() => b.typing.some(event => event.userId === a.id && !event.typing)), 'typing_stop_missing')
    pass('private stop-typing signal')
  } else fail('private typing signal', 'No typing broadcast received')
  stage = 'remote-backed branch browser test'
  const browser = await chromium.launch()
  const check = expect.configure({ timeout: 20000 })
  const root = 'http://127.0.0.1:3302'
  try {
    const pages = []
    for (const user of [a,b]) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
      const page = await context.newPage(); pages.push(page)
      await page.goto(`${root}/login?returnTo=${encodeURIComponent(`/messages/chat?conversation=${conversation}`)}`)
      await page.getByLabel('Email',{exact:true}).fill(user.email)
      await page.getByRole('button',{name:'Continue with email',exact:true}).click()
      await page.getByLabel('Password',{exact:true}).fill(password)
      await page.getByRole('button',{name:'Sign in',exact:true}).click()
      await check(page.getByRole('log',{name:'Message history'})).toBeVisible()
    }
    const [pageA,pageB] = pages
    await pageB.goto(`${root}/messages`)
    await check(pageB.getByRole('heading',{name:'Messages',exact:true})).toBeVisible()
    const body = `Remote browser read receipt ${run}`
    await pageA.getByRole('textbox',{name:'Message',exact:true}).fill(body)
    await pageA.getByRole('button',{name:'Send',exact:true}).click()
    const sent = pageA.locator('.live-message.mine').filter({has:pageA.getByText(body,{exact:true})})
    await check(sent.getByText(/· Sent/)).toBeVisible()
    await pageB.goto(`${root}/messages/chat?conversation=${conversation}`)
    await check(pageB.getByRole('log').getByText(body,{exact:true})).toBeVisible()
    await check(sent.getByText(/· Read/)).toBeVisible()
    pass('real remote-backed browsers: Sent changes to Read live')
    const composer = pageB.getByRole('textbox',{name:'Message',exact:true})
    const indicator = pageA.getByRole('status',{name:'Messaging Check b is typing',exact:true})
    await composer.fill('An unsent private draft')
    await check(indicator).toBeVisible()
    await check(indicator).toHaveCount(0)
    await check(composer).toHaveValue('An unsent private draft')
    pass('real remote-backed browsers: typing dots, idle expiry and draft preservation')
    const replyText = `Remote browser reply ${run}`
    await composer.fill(replyText)
    await check(indicator).toBeVisible()
    await pageB.getByRole('button',{name:'Send',exact:true}).click()
    await check(indicator).toHaveCount(0)
    await check(pageA.getByRole('log').getByText(replyText,{exact:true})).toBeVisible()
    await check(pageB.locator('.live-message.mine').filter({has:pageB.getByText(replyText,{exact:true})}).getByText(/· Read/)).toBeVisible()
    pass('real remote-backed browsers: stop-on-send, live reply and read receipt')
    stage = 'live remote chat requests'
    await pageB.goto(`${root}/messages/requests`)
    await check(pageB.getByText('No pending requests.', { exact: true })).toBeVisible()
    await discoverable(b, true); await discoverable(outsider, true)
    await api(outsider, `/api/connections/${b.id}`, {})
    const requestEntry = pageB.getByRole('region', { name: 'Request from Messaging Check outsider', exact: true })
    await check(requestEntry).toBeVisible()
    pass('real remote-backed Requests page: incoming request appears without refresh')
    const withdrawn = await fetch(new URL(`/api/connections/${b.id}`, origin), { method: 'DELETE',
      headers: { Authorization: `Bearer ${outsider.token}` }, signal: AbortSignal.timeout(20000) })
    requireValue(withdrawn.status === 200, 'request_withdrawal_failed')
    await check(requestEntry).toHaveCount(0)
    await check(pageB.getByText('No pending requests.', { exact: true })).toBeVisible()
    pass('real remote-backed Requests page: withdrawal disappears without refresh')
    await api(outsider, `/api/connections/${b.id}`, {})
    await check(requestEntry).toBeVisible()
    await requestEntry.getByRole('button', { name: 'Accept', exact: true }).click()
    await check(pageB).toHaveURL(/\/messages\/chat\?conversation=/)
    await check(pageB.getByRole('log', { name: 'Message history' })).toBeVisible()
    await check(pageB.getByRole('button', { name: 'View conversation members', exact: true })).toContainText('Messaging Check outsider')
    await discoverable(b, false); await discoverable(outsider, false)
    pass('real remote-backed Requests page: accepting opens the confirmed conversation')
  } finally { await browser.close() }
} catch (error) {
  fail(stage, /^[a-zA-Z0-9_: -]{1,180}$/.test(error.message ?? '') ? error.message : 'Remote check failed; sensitive diagnostics omitted')
} finally {
  for (const client of clients) {
    await Promise.race([client.removeAllChannels().catch(() => {}), delay(5000)])
    client.realtime.disconnect()
  }
  const cleanupErrors = []
  if (users.length >= 2) {
    const ids = users.map(user => user.id).sort()
    const members = ids.map(id => `'${id}'`).join(',')
    const sources = ids.flatMap((low, index) => ids.slice(index + 1).map(high => `'direct:${low}:${high}'`)).join(',')
    const cleanupSql = `begin;
      delete from public.connections where user_a in (${members}) and user_b in (${members});
      ${native ? `delete from public.conversations where source_key in (${sources});` : `delete from public.conversations where user_a in (${members}) and user_b in (${members});`}
      do $$ begin assert not exists(select 1 from public.messages where position('${run}' in body)>0), 'Test messages remain'; end $$;
      commit;`
    const cleanupFile = `/tmp/meet-people-remote-cleanup-${run}.sql`
    writeFileSync(cleanupFile,cleanupSql)
    try {
      execFileSync('pnpm',['exec','supabase','db','query','--linked','--project-ref',target.hostname.split('.')[0],'--file',cleanupFile,'--output','json'],{stdio:'pipe',encoding:'utf8',timeout:30000})
    } catch { cleanupErrors.push('scoped-sql-cleanup-failed') }
  }
  let deletedUsers = 0
  for (const user of users) {
    const check = await admin.auth.admin.getUserById(user.id)
    if (check.data.user?.app_metadata?.messaging_check !== run) { cleanupErrors.push('test-user-marker-mismatch'); continue }
    const removed = await admin.auth.admin.deleteUser(user.id)
    if (removed.error) cleanupErrors.push(`user:${removed.error.code ?? removed.error.status}`)
    else deletedUsers++
  }
  report.cleanup = { createdUsers: users.length, deletedUsers, errors: cleanupErrors }
  writeFileSync('test-results/remote-messaging-report.json', JSON.stringify(report, null, 2) + '\n')
  console.log('CLEANUP:', JSON.stringify(report.cleanup))
  if (cleanupErrors.length) failed = true
}
process.exitCode = failed ? 1 : 0
