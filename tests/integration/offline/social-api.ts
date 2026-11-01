/** Explicit offline API -> real SQL flow, synthetic Auth transport (NOT live JWT or
 * PostgREST proof). Never imported by ordinary tests; fixed network-none target.
 * pnpm --config.verify-deps-before-run=false exec tsx tests/integration/offline/social-api.ts
 */
import { execFileSync, spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import type { Request, Response } from 'express'
import { createSocialRouter } from '../../../api/social.js'
import { createMatchmakingRouter, type UserContextTransport } from '../../../api/matchmaking.js'
import { ConnectionStateSchema } from '../../../shared/connections.js'
import { ConversationsSchema, HistorySchema, MessageSchema, MessagingActivitySchema, ReadStateSchema } from '../../../shared/messaging.js'
import { OwnerBlockStateSchema } from '../../../shared/safety.js'
const container = process.argv[2] ?? 'pebble-safety-review-20261019', database = 'pebble_safety_owner_disposable'
assert.match(container, /^pebble-safety-review-20261019(?:-fresh|-final)?$/)
const inspected = JSON.parse(execFileSync('docker', ['inspect', '--format', '{{json .}}', container], { encoding: 'utf8' }))
assert.equal(inspected.HostConfig.NetworkMode, 'none'); assert.deepEqual(inspected.NetworkSettings.Ports, {})
const a = 'ea000000-0000-4000-8000-000000000001', b = 'ea000000-0000-4000-8000-000000000002', outsider = 'ea000000-0000-4000-8000-000000000003'
const literal = (value: unknown) => value === null ? 'null' : `'${String(value).replaceAll("'", "''")}'`
function sql(source: string) {
  const result = spawnSync('docker', ['exec', '-i', container, 'psql', '-X', '-qAt', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-d', database], { input: source, encoding: 'utf8' })
  if (result.status) return { data: null, error: { code: result.stderr.match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1] ?? 'unknown' } }
  const last = result.stdout.trim().split('\n').at(-1)
  return { data: last ? JSON.parse(last) as unknown : null, error: null }
}
function checked(source: string) { const result = sql(source); assert.equal(result.error, null, JSON.stringify(result.error)); return result.data }
checked("do $$ begin if not exists(select 1 from public.safety_owner_disposable_marker where singleton and purpose='network-none-safety-owner-v1') then raise exception 'Wrong target'; end if; end $$;")
checked(`do $$ begin if exists(select 1 from auth.users where id in('${a}','${b}','${outsider}')) then raise exception 'Fixture occupied'; end if; end $$;`)
function call(actor: string, name: string, args: unknown[] = []) {
  // The actor is chosen solely by this synthetic verifier; never request JSON.
  return Promise.resolve(sql(`begin; set local role authenticated; set local request.jwt.claim.sub=${literal(actor)}; select public.${name}(${args.map(literal).join(',')})::text; commit;`))
}
const transport = {
  verify: async (token: string) => [a, b, outsider].includes(token) ? { id: token } : null,
  actor: (token: string) => ({
    socialConnection: (target: string, action: string) => call(token, 'social_connection', [target, action]),
    socialConnectionList: () => call(token, 'social_connection_list'),
    socialInbox: (page: number) => call(token, 'social_inbox', [page]),
    socialHistory: (conversation: string, before: number | null, after: number | null) => call(token, 'social_history', [conversation, before, after]),
    socialSend: (conversation: string, body: string, request: string) => call(token, 'social_send', [conversation, body, request]),
    socialRead: (conversation: string, seq: number) => call(token, 'social_read', [conversation, seq]),
    socialActivity: () => call(token, 'social_activity'),
    ownerBlockState: (target: string) => call(token, 'get_owner_block_state', [target]),
    blockOwnerTarget: (target: string) => call(token, 'block_owner_target', [target]),
    unblockOwnerTarget: (target: string) => call(token, 'unblock_owner_target', [target]),
  }),
} as unknown as UserContextTransport
async function request(kind: 'connections' | 'conversations' | 'safety', actor: string, method: string, url: string, body?: unknown) {
  return new Promise<{ status: number; data: unknown }>((resolve, reject) => {
    let status = 200
    const req = { method, url, query: Object.fromEntries(new URL(url, 'http://offline').searchParams), headers: { authorization: `Bearer ${actor}` }, body } as unknown as Request
    const res = { locals: {}, set() { return this }, status(value: number) { status = value; return this }, json(data: unknown) { resolve({ status, data }); return this } } as unknown as Response
    const router = kind === 'safety' ? createMatchmakingRouter(transport) : createSocialRouter(transport, kind)
    router(req, res, error => reject(error ?? new Error('Unexpected route miss')))
  })
}
checked(`insert into auth.users values('${a}'),('${b}'),('${outsider}'); insert into public.profiles(id,username,display_name,birthdate,location_city) values('${a}','offline-social-a','Synthetic A','2000-01-01','Synthetic campus'),('${b}','offline-social-b','Synthetic B','2000-01-01','Synthetic campus'),('${outsider}','offline-social-c','Synthetic C','2000-01-01','Synthetic campus'); insert into public.account_settings(user_id,preferences,settings,completed) select id,'{"distance":"Nearby","group":"One-on-one","intents":["Activity partners"],"usual":[]}','{"notifications":false,"availability":false,"discoverable":true,"location":false}','[0,1,2,3]' from public.profiles where username in('offline-social-a','offline-social-b','offline-social-c');`)
checked(`insert into public.user_interests(profile_id,text) select p.id,x from public.profiles p cross join unnest(array['Art','Coffee','Music']) x where p.username in('offline-social-a','offline-social-b','offline-social-c'); insert into public.availability(profile_id,dow,start_time,end_time) select p.id,1,'12:00','17:00' from public.profiles p where p.username in('offline-social-a','offline-social-b','offline-social-c');`)
try {
  assert.equal(ConnectionStateSchema.parse((await request('connections', a, 'POST', `/${b}`, {})).data).status, 'sent')
  const accepted = await request('connections', b, 'POST', `/${a}/accept`, {})
  assert.equal(accepted.status, 200); const connection = ConnectionStateSchema.parse(accepted.data); assert.equal(connection.status, 'connected')
  const chat = connection.conversationId; assert.ok(chat); assert.match(chat, /^[0-9a-f-]{36}$/)
  const body = { body: 'Persisted offline flow 🪨', clientRequestId: 'eb000000-0000-4000-8000-000000000001' }
  const message = await request('conversations', a, 'POST', `/${chat}/messages`, body)
  assert.equal(message.status, 200); const savedMessage = MessageSchema.parse(message.data)
  assert.deepEqual(await request('conversations', a, 'POST', `/${chat}/messages`, body), message)
  const inbox = await request('conversations', b, 'GET', '/?page=1')
  assert.equal(ConversationsSchema.parse(inbox.data).conversations[0].unread_count, 1)
  assert.deepEqual(HistorySchema.parse((await request('conversations', b, 'GET', `/${chat}/messages`)).data).messages, [message.data])
  assert.equal((await request('conversations', outsider, 'GET', `/${chat}/messages`)).status, 403)
  assert.equal(ReadStateSchema.parse((await request('conversations', b, 'POST', `/${chat}/read`, { seq: savedMessage.seq })).data).lastReadSeq, savedMessage.seq)
  assert.equal(MessagingActivitySchema.parse((await request('conversations', b, 'GET', '/activity')).data).unreadConversations, 0)
  assert.equal(OwnerBlockStateSchema.parse((await request('safety', b, 'PUT', `/safety/blocks/${a}`, {})).data).outgoingBlocked, true)
  const history = await request('conversations', b, 'GET', `/${chat}/messages`)
  const blockedHistory = HistorySchema.parse(history.data)
  assert.equal(blockedHistory.canSend, false); assert.deepEqual(blockedHistory.messages, [message.data])
  assert.equal((await request('conversations', a, 'POST', `/${chat}/messages`, { ...body, clientRequestId: 'eb000000-0000-4000-8000-000000000002' })).status, 403)
  assert.equal((await request('conversations', b, 'POST', `/${chat}/read`, { seq: savedMessage.seq })).status, 403)
  assert.equal((await request('safety', b, 'DELETE', `/safety/blocks/${a}`, {})).status, 200)
  assert.equal(HistorySchema.parse((await request('conversations', a, 'GET', `/${chat}/messages`)).data).canSend, false)
  console.log('PASS: API -> actual SQL request/accept/send/idempotency/readback/unread/receipt/block/history/unblock flow; foreign-user denial. Synthetic Auth, no live PostgREST claim.')
} finally {
  checked(`begin; do $$ begin if exists(select 1 from public.profiles where id in('${a}','${b}','${outsider}') and username not in('offline-social-a','offline-social-b','offline-social-c')) then raise exception 'Unrecognized fixture'; end if; end $$; delete from safety_private.revoked_connections where connection_id in(select id from public.connections where user_a='${a}' and user_b='${b}'); delete from auth.users where id in('${a}','${b}','${outsider}'); commit;`)
}
