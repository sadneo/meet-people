// @vitest-environment node
import express from 'express'
import { createClient } from '@supabase/supabase-js'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMessagingRouter } from '../api/messaging'

const user = 'a0000000-0000-4000-8000-000000000001'
const other = 'a0000000-0000-4000-8000-000000000002'
const conversation = 'c0000000-0000-4000-8000-000000000001'
const missing = 'c0000000-0000-4000-8000-000000000099'
const requestId = 'd0000000-0000-4000-8000-000000000001'
const message = { id: 'b0000000-0000-4000-8000-000000000001', conversation_id: conversation, seq: 7, sender_id: user, body: 'Hello', created_at: '2026-10-08T12:00:00Z' }
const participants = [{ id: user, display_name: 'Sam', avatar_url: null, last_read_seq: 7 }, { id: other, display_name: 'Taylor', avatar_url: null, last_read_seq: 5 }]
const history = { kind: 'direct', canSend: true, messages: [message], participants, nextCursor: null }
const calls: { path: URL; body: Record<string, unknown> | null }[] = []
let failure: { code: string; status?: number } | null = null
const databaseFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const path = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  const body = init?.body ? JSON.parse(String(init.body)) : null
  calls.push({ path, body })
  const result = (data: unknown, status = 200) => new Response(data === null ? null : JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
  if (path.pathname === '/auth/v1/user') {
    const token = new Headers(init?.headers).get('authorization')
    return token === 'Bearer participant' ? result({ id: user }) : token === 'Bearer outsider' ? result({ id: other }) : result({ message: 'Invalid token' }, 401)
  }
  if (failure) return result({ code: failure.code, message: 'private database details and secret' }, failure.status ?? 400)
  if (body?.p_conversation_id === missing) return result({ code: 'MSG01', message: 'missing' }, 400)
  if (body?.p_user_id === other) return result({ code: path.pathname.endsWith('event_conversation') ? 'MSG04' : 'MSG03', message: 'forbidden' }, 400)
  if (path.pathname.endsWith('messaging_list_conversations')) return result({ conversations: [{ id: conversation, kind: 'direct', created_at: message.created_at, participants, latest_message: message, unread_count: 2 }], hasMore: false })
  if (path.pathname.endsWith('messaging_history')) return result(history)
  if (path.pathname.endsWith('messaging_send')) return result({ ...message, body: body.p_body })
  if (path.pathname.endsWith('messaging_mark_read')) return result(body.p_seq)
  if (path.pathname.endsWith('messaging_leave')) return result(null, 204)
  if (path.pathname.endsWith('messaging_ensure_event_conversation')) return result(conversation)
  if (path.pathname.endsWith('messaging_activity')) return result({ unreadConversations: 2, incomingRequests: 1 })
  throw new Error(`Unexpected database request ${path.pathname}`)
})
const client = createClient('http://database.test', 'service-test-key', { global: { fetch: databaseFetch }, auth: { persistSession: false, autoRefreshToken: false } })
const app = express()
app.use(express.json())
app.use('/api/conversations', createMessagingRouter(client))
app.use('/unconfigured', createMessagingRouter(null))
const server = app.listen(0, '127.0.0.1')
let url: string
const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
beforeAll(async () => {
  if (!server.listening) await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject) })
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())))
beforeEach(() => { calls.length = 0; failure = null; logged.mockClear() })
function request(path = '', body?: unknown, token = 'participant') {
  return fetch(`${url}/api/conversations${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
}
const rpcCalls = () => calls.filter(call => call.path.pathname.includes('/rpc/'))

describe('messaging API with mocked Supabase transport (SQL behavior is tested separately)', () => {
  it('lists with unread counts using verified identity and never accepts a claimed user ID', async () => {
    const response = await request()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ conversations: [{ id: conversation, kind: 'direct', participants, unread_count: 2 }] })
    expect(calls.at(-1)?.body).toEqual({ p_user_id: user, p_page: 1 })
    expect((await request('?userId=someone-else')).status).toBe(400)
  })
  it('reports unread conversations and incoming requests for the verified user', async () => {
    expect(await (await request('/activity')).json()).toEqual({ unreadConversations: 2, incomingRequests: 1 })
    expect(calls.at(-1)?.body).toEqual({ p_user_id: user })
    expect((await request('/activity', undefined, 'invalid')).status).toBe(401)
  })
  it('requires valid authentication and configuration', async () => {
    expect((await fetch(`${url}/api/conversations`)).status).toBe(401)
    expect((await request('', undefined, 'invalid')).status).toBe(401)
    expect((await fetch(`${url}/unconfigured`)).status).toBe(503)
    expect(rpcCalls()).toEqual([])
  })
  it('pages back with `before` and polls with `after`, never both', async () => {
    const response = await request(`/${conversation}/messages?before=7`)
    expect(await response.json()).toEqual(history)
    expect(calls.at(-1)?.body).toEqual({ p_user_id: user, p_conversation_id: conversation, p_before: 7, p_after: null })
    await request(`/${conversation}/messages?after=7`)
    expect(calls.at(-1)?.body).toEqual({ p_user_id: user, p_conversation_id: conversation, p_before: null, p_after: 7 })
    calls.length = 0
    for (const query of ['before=1&after=2', 'before=0', 'after=-1', 'before=bad', `before=${message.id}`]) {
      expect((await request(`/${conversation}/messages?${query}`)).status).toBe(400)
    }
    expect(rpcCalls()).toEqual([])
  })
  it('rejects outsiders reading, posting, marking read or leaving', async () => {
    for (const [path, body] of [['/messages', undefined], ['/messages', { body: 'Intrusion', clientRequestId: requestId }], ['/read', { seq: 1 }], ['/leave', {}]] as const) {
      const response = await request(`/${conversation}${path}`, body, 'outsider')
      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ error: 'You are not in this conversation.' })
    }
  })
  it('trims sends, derives the sender from the session, and returns the saved message', async () => {
    const response = await request(`/${conversation}/messages`, { body: '  Hello  ', clientRequestId: requestId })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(message)
    expect(calls.at(-1)?.body).toEqual({ p_user_id: user, p_conversation_id: conversation, p_body: 'Hello', p_request_id: requestId })
  })
  it.each(['', '   ', '\n\t', 'x'.repeat(2001)])('rejects empty or oversized text (%#)', async body => {
    expect((await request(`/${conversation}/messages`, { body, clientRequestId: requestId })).status).toBe(400)
    expect(rpcCalls()).toEqual([])
  })
  it('rejects forged senders and malformed IDs or payloads', async () => {
    expect((await request(`/${conversation}/messages`, { body: 'Hello', sender_id: other, clientRequestId: requestId })).status).toBe(400)
    expect((await request('/not-a-uuid/messages')).status).toBe(400)
    expect((await request('/not-a-uuid/leave', {})).status).toBe(400)
    expect((await request(`/${conversation}/read`, { seq: -1 })).status).toBe(400)
    expect((await request(`/${conversation}/read`, { seq: 1, userId: other })).status).toBe(400)
    expect((await request(`/${conversation}/leave`, { userId: other })).status).toBe(400)
    expect((await request('?page=0')).status).toBe(400)
    expect(rpcCalls()).toEqual([])
  })
  it('handles nonexistent conversations', async () => {
    expect((await request(`/${missing}/messages`)).status).toBe(404)
    expect((await request(`/${missing}/messages`, { body: 'Hello', clientRequestId: requestId })).status).toBe(404)
  })
  it('marks read and leaves for the verified user', async () => {
    expect(await (await request(`/${conversation}/read`, { seq: 9 })).json()).toEqual({ lastReadSeq: 9 })
    expect(calls.at(-1)?.body).toEqual({ p_user_id: user, p_conversation_id: conversation, p_seq: 9 })
    const left = await request(`/${conversation}/leave`, {})
    expect(left.status).toBe(204)
    expect(calls.at(-1)?.body).toEqual({ p_user_id: user, p_conversation_id: conversation })
  })
  it('creates or opens chats only from verified event groups, never arbitrary participants', async () => {
    expect(await (await request('', { eventGroupId: conversation })).json()).toEqual({ conversationId: conversation })
    expect(calls.at(-1)?.body).toEqual({ p_group_id: conversation, p_user_id: user })
    expect((await request('', { participantIds: [user, other] })).status).toBe(400)
    const outsider = await request('', { eventGroupId: conversation }, 'outsider')
    expect(outsider.status).toBe(403)
    expect(await outsider.json()).toEqual({ error: 'You are not in this group.' })
  })
  it.each([
    ['MSG05', 403, 'You can’t send messages in this conversation.'],
    ['MSG06', 409, 'A group needs at least two people before it has a conversation.'],
    ['MSG07', 409, 'No one else is in this conversation.'],
    ['MSG10', 409, 'This request was already used for a different message.'],
    ['MSG11', 429, 'You’re sending messages too quickly. Wait a moment and try again.'],
    ['MSG12', 409, 'Direct conversations end when the connection ends.'],
  ])('maps expected SQL outcome %s to a specific response', async (code, status, error) => {
    failure = { code }
    const response = await request(`/${conversation}/messages`, { body: 'Hello', clientRequestId: requestId })
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ error })
    expect(logged).not.toHaveBeenCalled()
  })
  it.each([['XX000', 500], ['42501', 403], ['P0002', 400]])('treats unexpected database code %s as an outage, logged but not exposed', async (code, status) => {
    failure = { code, status }
    const response = await request(`/${conversation}/messages`)
    expect(response.status).toBe(503)
    expect(await response.text()).not.toMatch(/private|secret|XX000|42501|P0002/)
    expect(logged).toHaveBeenCalledOnce()
  })
})
