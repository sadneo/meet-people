// @vitest-environment node
import express from 'express'
import { createClient } from '@supabase/supabase-js'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMessagingRouter, ensureConversationForParticipants } from '../api/messaging'

const user = 'a0000000-0000-4000-8000-000000000001'
const other = 'a0000000-0000-4000-8000-000000000002'
const conversation = 'c0000000-0000-4000-8000-000000000001'
const missing = 'c0000000-0000-4000-8000-000000000099'
const requestId = 'd0000000-0000-4000-8000-000000000001'
const message = { id: 'b0000000-0000-4000-8000-000000000001', conversation_id: conversation, sender_id: user, body: 'Hello', created_at: '2026-10-08T12:00:00Z', client_request_id: requestId }
const participants = [{ id: user, display_name: 'Sam', avatar_url: null }, { id: other, display_name: 'Taylor', avatar_url: null }]
const calls: { path: URL; body: Record<string, unknown> | null }[] = []
let unavailable = false
const databaseFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const path = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  const body = init?.body ? JSON.parse(String(init.body)) : null
  calls.push({ path, body })
  const result = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
  if (path.pathname === '/auth/v1/user') {
    const token = new Headers(init?.headers).get('authorization')
    return token === 'Bearer participant' ? result({ id: user }) : token === 'Bearer outsider' ? result({ id: other }) : result({ message: 'Invalid token' }, 401)
  }
  if (unavailable) return result({ code: 'XX000', message: 'private database details and secret' }, 500)
  if (body?.p_conversation_id === missing) return result({ code: 'P0002', message: 'missing' }, 400)
  if (body?.p_user_id === other) return result({ code: '42501', message: 'forbidden' }, 403)
  if (path.pathname.endsWith('messaging_list_conversations')) return result({ conversations: [{ id: conversation, created_at: message.created_at, participants, latest_message: message }], hasMore: false })
  if (path.pathname.endsWith('messaging_history')) return result({ messages: [message], participants, nextCursor: null })
  if (path.pathname.endsWith('messaging_send')) return result({ ...message, body: body.p_body })
  if (path.pathname.endsWith('messaging_ensure_event_conversation') || path.pathname.endsWith('messaging_ensure_conversation')) return result(conversation)
  throw new Error(`Unexpected database request ${path.pathname}`)
})
const client = createClient('http://database.test', 'service-test-key', { global: { fetch: databaseFetch }, auth: { persistSession: false, autoRefreshToken: false } })
const app = express()
app.use(express.json())
app.use('/api/conversations', createMessagingRouter(client))
app.use('/unconfigured', createMessagingRouter(null))
const server = app.listen(0, '127.0.0.1')
let url: string
beforeAll(async () => {
  if (!server.listening) await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject) })
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())))
beforeEach(() => { calls.length = 0; unavailable = false })
function request(path = '', body?: unknown, token = 'participant') {
  return fetch(`${url}/api/conversations${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
}
describe('messaging API with mocked Supabase transport (SQL behavior is tested separately)', () => {
  it('lists using verified identity and never accepts a claimed user ID', async () => {
    const response = await request()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ conversations: [{ id: conversation, participants }] })
    expect(calls.at(-1)?.body).toEqual({ p_user_id: user, p_page: 1 })
    expect((await request('?userId=someone-else')).status).toBe(400)
  })
  it('requires valid authentication and configuration', async () => {
    expect((await fetch(`${url}/api/conversations`)).status).toBe(401)
    expect((await request('', undefined, 'invalid')).status).toBe(401)
    expect((await fetch(`${url}/unconfigured`)).status).toBe(503)
    expect(calls.every(call => call.path.pathname === '/auth/v1/user')).toBe(true)
  })
  it('fetches history with membership identity and scoped cursor', async () => {
    const response = await request(`/${conversation}/messages?before=${message.id}`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ messages: [message], participants, nextCursor: null })
    expect(calls.at(-1)?.body).toEqual({ p_user_id: user, p_conversation_id: conversation, p_before: message.id })
  })
  it('rejects outsiders reading or posting and returns no messages', async () => {
    for (const body of [undefined, { body: 'Intrusion', clientRequestId: requestId }]) {
      const response = await request(`/${conversation}/messages`, body, 'outsider')
      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ error: 'You are not a participant in this conversation or group.' })
    }
  })
  it('trims sends, derives sender from session, forwards deduplication ID, and returns database timestamp', async () => {
    const response = await request(`/${conversation}/messages`, { body: '  Hello  ', clientRequestId: requestId })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(message)
    expect(calls.at(-1)?.body).toEqual({ p_user_id: user, p_conversation_id: conversation, p_body: 'Hello', p_request_id: requestId })
  })
  it.each(['', '   ', '\n\t', 'x'.repeat(2001)])('rejects empty or oversized text (%#)', async body => {
    expect((await request(`/${conversation}/messages`, { body, clientRequestId: requestId })).status).toBe(400)
    expect(calls.some(call => call.path.pathname.includes('/rpc/'))).toBe(false)
  })
  it('rejects forged sender and malformed IDs or payloads', async () => {
    expect((await request(`/${conversation}/messages`, { body: 'Hello', sender_id: other, clientRequestId: requestId })).status).toBe(400)
    expect((await request('/not-a-uuid/messages')).status).toBe(400)
    expect((await request(`/${conversation}/messages?before=bad`)).status).toBe(400)
    expect((await request('?page=0')).status).toBe(400)
  })
  it('handles nonexistent conversations for reading and sending', async () => {
    expect((await request(`/${missing}/messages`)).status).toBe(404)
    expect((await request(`/${missing}/messages`, { body: 'Hello', clientRequestId: requestId })).status).toBe(404)
  })
  it('creates/retrieves only from verified event groups, not arbitrary participant claims', async () => {
    expect(await (await request('', { eventGroupId: conversation })).json()).toEqual({ conversationId: conversation })
    expect(calls.at(-1)?.body).toEqual({ p_group_id: conversation, p_user_id: user })
    expect((await request('', { participantIds: [user, other] })).status).toBe(400)
    expect((await request('', { eventGroupId: conversation }, 'outsider')).status).toBe(403)
  })
  it('offers a trusted messaging-side contract for future matches', async () => {
    expect(await ensureConversationForParticipants(client, [user, other])).toEqual({ conversationId: conversation })
    expect(calls.at(-1)?.body).toEqual({ p_participant_ids: [user, other] })
  })
  it('sanitizes database failures', async () => {
    unavailable = true
    const response = await request(`/${conversation}/messages`)
    expect(response.status).toBe(503)
    expect(await response.text()).not.toMatch(/private|secret|XX000/)
  })
})
