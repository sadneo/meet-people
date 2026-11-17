// Real local Auth -> private Realtime channels -> database-triggered broadcasts.
// Requires the Realtime migration; creates and removes only synthetic fixtures.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { setTimeout, clearTimeout } from 'node:timers'
import { URL } from 'node:url'
import console from 'node:console'
import { createClient } from '@supabase/supabase-js'

const { fetch } = globalThis
const status = execFileSync('sh', ['scripts/supabase.sh', 'status', '--output', 'env'], { encoding: 'utf8', stdio: 'pipe' })
const values = Object.fromEntries(status.trim().split('\n').map(line => {
  const [key, value] = line.split(/=(.*)/s, 2)
  return [key, value.replace(/^"|"$/g, '')]
}))
const url = values.API_URL ?? values.SUPA_API_URL
const endpoint = new URL(url)
assert.ok(endpoint.protocol === 'http:' && endpoint.hostname === '127.0.0.1', 'Local Supabase only')
const key = values.PUBLISHABLE_KEY ?? values.ANON_KEY
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(url, values.SERVICE_ROLE_KEY, options)
const clients = [], users = []
const groupId = randomUUID(), sourceKey = `realtime-test:${randomUUID()}`
const sql = source => execFileSync('docker', ['exec', '-i', 'supabase_db_meet-people', 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: source, encoding: 'utf8', stdio: 'pipe' }).trim()
const quote = value => `'${value.replaceAll("'", "''")}'`
const waitFor = async predicate => {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return
    await delay(100)
  }
  assert.fail('Timed out waiting for local Realtime broadcast')
}
async function actor() {
  const email = `realtime-${randomUUID()}@example.test`, password = `${randomUUID()}-Aa1!`
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  assert.ifError(created.error)
  users.push(created.data.user.id)
  const client = createClient(url, key, options)
  clients.push(client)
  const login = await client.auth.signInWithPassword({ email, password })
  assert.ifError(login.error)
  await client.realtime.setAuth(login.data.session.access_token)
  return { client, id: created.data.user.id, token: login.data.session.access_token, events: [] }
}
function subscribe(client, topic, events, allowed = true) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Local Realtime subscription timed out')), 10_000)
    const channel = client.channel(topic, { config: { private: true } })
      .on('broadcast', { event: 'changed' }, event => events.push(event.payload))
      .subscribe((status, error) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout)
          if (allowed) resolve(channel)
          else reject(new Error('Unauthorized private channel subscription succeeded'))
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timeout)
          if (allowed) reject(new Error(`Local Realtime subscription failed: ${status}: ${error?.message ?? ''}`))
          else resolve(channel)
        }
      })
  })
}

assert.equal(sql("select to_regnamespace('messaging_realtime_private') is not null"), 't', 'Apply the messaging Realtime migration first')
try {
  const [a, b, outsider] = await Promise.all([actor(), actor(), actor()])
  const anonymous = createClient(url, key, options)
  clients.push(anonymous)
  await Promise.all([
    subscribe(a.client, `messaging:${a.id}`, a.events),
    subscribe(b.client, `messaging:${b.id}`, b.events),
    subscribe(outsider.client, `messaging:${outsider.id}`, outsider.events),
    subscribe(outsider.client, `messaging:${b.id}`, [], false),
    subscribe(anonymous, `messaging:${b.id}`, [], false),
  ])
  const forged = await fetch(`${url}/realtime/v1/api/broadcast`, {
    method: 'POST', headers: { apikey: key, Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ topic: `messaging:${a.id}`, event: 'changed', payload: { forged: true }, private: true }] }),
  })
  // The batch endpoint can acknowledge the request with 202 while dropping
  // messages that fail authorization. Verify delivery, not just that envelope.
  assert.ok([202, 403].includes(forged.status), 'Unexpected broadcast endpoint response')
  await delay(500)
  assert.equal(a.events.length, 0, 'Client published a server invalidation')

  sql(`insert into active_friends_private.groups(id,target_size) values('${groupId}',3);
    insert into active_friends_private.group_members(group_id,user_id,maximum_size) values
      ('${groupId}','${a.id}',3),('${groupId}','${b.id}',3);`)
  await waitFor(() => a.events.length > 0 && b.events.length > 0)
  await delay(200)
  a.events.length = 0; b.events.length = 0
  sql(`insert into active_friends_private.messages(group_id,seq,sender_id,body,request_id)
    values('${groupId}',1,'${a.id}','Synthetic realtime test','${randomUUID()}');`)
  await waitFor(() => a.events.length > 0 && b.events.length > 0)
  // realtime.send may append a generated broadcast ID to the empty app payload.
  assert.ok([...a.events, ...b.events].every(payload => Object.keys(payload).every(key => key === 'id')), 'Broadcast must contain no message data')
  a.events.length = 0; b.events.length = 0
  sql(`update active_friends_private.group_members set read_seq=1 where group_id='${groupId}' and user_id='${b.id}';`)
  await waitFor(() => a.events.length > 0 && b.events.length > 0)
  a.events.length = 0; b.events.length = 0
  sql(`update active_friends_private.group_members set read_seq=1 where group_id='${groupId}' and user_id='${b.id}';`)
  await delay(500)
  assert.equal(a.events.length + b.events.length, 0, 'No-op read created a notification loop')
  sql(`update active_friends_private.group_members set left_at=now() where group_id='${groupId}' and user_id='${b.id}';`)
  await waitFor(() => a.events.length > 0 && b.events.length > 0)
  a.events.length = 0; b.events.length = 0
  sql(`insert into active_friends_private.messages(group_id,seq,sender_id,body,request_id)
    values('${groupId}',2,'${a.id}','After departure','${randomUUID()}');`)
  await waitFor(() => a.events.length > 0)
  await delay(500)
  assert.equal(b.events.length, 0, 'Departed member received a notification')
  assert.equal(outsider.events.length, 0, 'Outsider received a notification')

  if (sql("select to_regclass('public.conversation_participants') is not null") === 't') {
    const chat = sql(`insert into public.conversations(kind,source_key) values('direct',${quote(sourceKey)}) returning id;`)
    sql(`insert into public.conversation_participants(conversation_id,user_id) values('${chat}','${a.id}'),('${chat}','${b.id}');`)
    await waitFor(() => b.events.length > 0)
    await delay(200)
    a.events.length = 0; b.events.length = 0
    sql(`insert into public.messages(conversation_id,seq,sender_id,body,client_request_id)
      values('${chat}',1,'${a.id}','Synthetic direct message','${randomUUID()}');`)
    await waitFor(() => a.events.length > 0 && b.events.length > 0)
  }
  console.info('PASS: real private WebSocket delivery, owner isolation, anonymous/foreign subscription rejection, denied client publish, direct/group changes, read receipts and departure filtering.')
} finally {
  await Promise.all(clients.map(client => client.removeAllChannels()))
  // Fixed synthetic group and source key only; existing application data is untouched.
  sql(`begin;
    delete from active_friends_private.messages where group_id='${groupId}';
    delete from active_friends_private.group_members where group_id='${groupId}';
    delete from active_friends_private.groups where id='${groupId}';
    do $$ begin if to_regclass('public.conversation_participants') is not null then
      delete from public.conversations where source_key=${quote(sourceKey)};
    end if; end $$;
    commit;`)
  for (const id of users) assert.ifError((await admin.auth.admin.deleteUser(id)).error)
}
