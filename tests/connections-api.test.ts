// @vitest-environment node
import express from 'express'
import { createClient } from '@supabase/supabase-js'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createConnectionsRouter } from '../api/connections'

const user = 'a0000000-0000-4000-8000-000000000001'
const taylor = 'a0000000-0000-4000-8000-000000000002'
const chat = 'c0000000-0000-4000-8000-000000000001'
const list = { incoming: [{ id: taylor, display_name: 'Taylor', avatar_url: null, requested_at: '2026-10-13T12:00:00Z' }], sent: [], connected: [] }
const calls: { name: string; body: Record<string, unknown> }[] = []
let failure: string | null = null
const databaseFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const path = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  const result = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
  if (path.pathname === '/auth/v1/user') {
    return new Headers(init?.headers).get('authorization') === 'Bearer participant' ? result({ id: user }) : result({ message: 'Invalid token' }, 401)
  }
  const name = path.pathname.split('/').at(-1)!
  calls.push({ name, body: JSON.parse(String(init?.body)) })
  if (failure) return result({ code: failure, message: 'private database details' }, 400)
  if (name === 'connection_list') return result(list)
  if (name === 'connection_accept') return result({ status: 'connected', conversationId: chat })
  if (name === 'connection_request') return result({ status: 'sent', conversationId: null })
  return result({ status: 'none', conversationId: null })
})
const client = createClient('http://database.test', 'service-test-key', { global: { fetch: databaseFetch }, auth: { persistSession: false, autoRefreshToken: false } })
const app = express()
app.use(express.json())
app.use('/api/connections', createConnectionsRouter(client))
app.use('/unconfigured', createConnectionsRouter(null))
const server = app.listen(0, '127.0.0.1')
let url: string
const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
beforeAll(async () => {
  if (!server.listening) await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject) })
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())))
beforeEach(() => { calls.length = 0; failure = null; logged.mockClear() })
function request(path = '', method = 'GET', body?: unknown, token = 'participant') {
  return fetch(`${url}/api/connections${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
}

describe('connections API with mocked Supabase transport (SQL behavior is tested separately)', () => {
  it('requires a verified session and configuration', async () => {
    expect((await fetch(`${url}/api/connections`)).status).toBe(401)
    expect((await request('', 'GET', undefined, 'forged')).status).toBe(401)
    expect((await fetch(`${url}/unconfigured`)).status).toBe(503)
    expect(calls).toEqual([])
  })
  it('lists and reads state for the verified user only', async () => {
    expect(await (await request()).json()).toEqual(list)
    expect(calls.at(-1)).toEqual({ name: 'connection_list', body: { p_user_id: user } })
    expect(await (await request(`/${taylor}`)).json()).toEqual({ status: 'none', conversationId: null })
    expect(calls.at(-1)).toEqual({ name: 'connection_state', body: { p_user_id: user, p_other_id: taylor } })
  })
  it('requests, accepts and removes by the other person’s ID', async () => {
    expect(await (await request(`/${taylor}`, 'POST', {})).json()).toEqual({ status: 'sent', conversationId: null })
    expect(calls.at(-1)).toEqual({ name: 'connection_request', body: { p_user_id: user, p_other_id: taylor } })
    expect(await (await request(`/${taylor}/accept`, 'POST', {})).json()).toEqual({ status: 'connected', conversationId: chat })
    expect(calls.at(-1)).toEqual({ name: 'connection_accept', body: { p_user_id: user, p_other_id: taylor } })
    expect(await (await request(`/${taylor}`, 'DELETE')).json()).toEqual({ status: 'none', conversationId: null })
    expect(calls.at(-1)).toEqual({ name: 'connection_remove', body: { p_user_id: user, p_other_id: taylor } })
  })
  it('rejects malformed IDs and any claimed user or status in the body', async () => {
    expect((await request('/not-a-uuid', 'POST', {})).status).toBe(400)
    expect((await request(`/${taylor}`, 'POST', { userId: user })).status).toBe(400)
    expect((await request(`/${taylor}/accept`, 'POST', { status: 'accepted' })).status).toBe(400)
    expect(calls).toEqual([])
  })
  it.each([
    ['CON01', 400, 'You can’t connect with yourself.'],
    ['CON02', 404, 'This person isn’t available.'],
    ['CON03', 409, 'There’s no request from this person to accept.'],
    ['CON04', 429, 'You’ve sent a lot of requests today. Try again tomorrow.'],
    ['CON05', 409, 'Set up your matching profile before connecting with people.'],
  ])('maps expected SQL outcome %s', async (code, status, error) => {
    failure = code
    const response = await request(`/${taylor}`, 'POST', {})
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ error })
    expect(logged).not.toHaveBeenCalled()
  })
  it('treats any other database failure as an outage, logged but not exposed', async () => {
    failure = '42501'
    const response = await request(`/${taylor}`, 'POST', {})
    expect(response.status).toBe(503)
    expect(await response.text()).not.toMatch(/private|42501/)
    expect(logged).toHaveBeenCalledOnce()
  })
})
