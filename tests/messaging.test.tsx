import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import App from '../src/App'
import type { Message } from '../shared/messaging'

const auth = vi.hoisted(() => ({ session: { user: { id: 'a0000000-0000-4000-8000-000000000001' } } as Session | null }))
vi.mock('../src/auth/useSession', () => ({ useSession: () => ({ session: auth.session, ready: true }) }))
vi.mock('../src/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'real-session' } } }) } } }))
const user = 'a0000000-0000-4000-8000-000000000001'
const a = 'c0000000-0000-4000-8000-000000000001'
const b = 'c0000000-0000-4000-8000-000000000002'
const participants = [{ id: user, display_name: 'Sam', avatar_url: null }, { id: 'a0000000-0000-4000-8000-000000000002', display_name: 'Taylor', avatar_url: null }]
const first: Message = { id: 'b0000000-0000-4000-8000-000000000001', conversation_id: a, sender_id: participants[1].id, body: 'Persisted hello', created_at: '2026-10-08T12:00:00Z', client_request_id: 'd0000000-0000-4000-8000-000000000001' }
let saved: Message[] = []
let failSend = false
let failHistory = false
let empty = false
let resolveSend: (() => void) | null = null
let delaySend = false
let holdHistory: (() => void) | null = null
let delayHistory = false
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
  if (init?.method === 'POST') {
    if (delaySend) await new Promise<void>(resolve => { resolveSend = resolve })
    if (failSend) return response({ error: 'Could not send.' }, 503)
    const payload = JSON.parse(String(init.body))
    const message = { ...first, id: crypto.randomUUID(), conversation_id: url.includes(b) ? b : a, sender_id: user, body: payload.body.trim(), client_request_id: payload.clientRequestId }
    saved.push(message)
    return response(message)
  }
  if (url.includes('/messages')) {
    if (url.includes(a) && delayHistory) await new Promise<void>(resolve => { holdHistory = resolve })
    if (failHistory) return response({ error: 'History unavailable.' }, 503)
    return response({ messages: saved.filter(message => url.includes(message.conversation_id)), participants, nextCursor: null })
  }
  return response({ conversations: empty ? [] : [a, b].map(id => ({ id, created_at: first.created_at, participants: id === a ? participants : [participants[0], { ...participants[1], display_name: 'Jordan' }], latest_message: saved.filter(message => message.conversation_id === id).at(-1) ?? null })), hasMore: false })
})
beforeEach(() => {
  saved = [first]; failSend = false; failHistory = false; empty = false; delaySend = false; resolveSend = null; delayHistory = false; holdHistory = null
  auth.session = { user: { id: user } } as Session
  vi.stubGlobal('fetch', fetchMock); fetchMock.mockClear()
  vi.stubGlobal('scrollTo', () => {})
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
function open(path = '/messages') { return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>) }
function history() { return within(screen.getByRole('region', { name: 'Message history' })) }
describe('persisted messaging UI with mocked API', () => {
  it('loads the inbox and saved history, sends once, and re-fetches after remount', async () => {
    const view = open()
    expect(screen.getByText('Loading conversations…')).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: /Taylor.*Persisted hello/ }))
    await history().findByText('Persisted hello')
    delaySend = true
    fireEvent.change(screen.getByLabelText('Message', { exact: true }), { target: { value: 'M3 messaging persistence test' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Send message' }))
    fireEvent.submit(screen.getByRole('form', { name: 'Send message' }))
    await waitFor(() => expect(resolveSend).not.toBeNull())
    expect(screen.getByRole('button', { name: 'Sending…' }).hasAttribute('disabled')).toBe(true)
    await act(async () => { resolveSend?.() })
    await history().findByText('M3 messaging persistence test')
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
    expect(fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')?.[1]?.headers).toMatchObject({ Authorization: 'Bearer real-session' })
    view.unmount(); open(`/messages/chat?conversation=${a}`)
    await history().findByText('M3 messaging persistence test')
    fireEvent.click(await screen.findByRole('button', { name: /Jordan.*Say hello/ }))
    await history().findByText('No messages yet. Say hello.')
    expect(history().queryByText('M3 messaging persistence test')).toBeNull()
  })
  it('retains failed drafts and reuses the request ID on retry', async () => {
    failSend = true
    open(`/messages/chat?conversation=${a}`)
    await history().findByText('Persisted hello')
    fireEvent.change(screen.getByLabelText('Message', { exact: true }), { target: { value: 'Try again' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send', exact: true }))
    await screen.findByText(/Your draft is kept/)
    expect((screen.getByLabelText('Message', { exact: true }) as HTMLInputElement).value).toBe('Try again')
    failSend = false
    fireEvent.click(screen.getByRole('button', { name: 'Send', exact: true }))
    await history().findByText('Try again')
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST').map(([, init]) => JSON.parse(String(init?.body)))
    expect(posts[0].clientRequestId).toBe(posts[1].clientRequestId)
  })
  it('shows history errors, blocks sending before load, and retries', async () => {
    failHistory = true
    open(`/messages/chat?conversation=${a}`)
    await screen.findByText('History unavailable.')
    expect(screen.getByRole('button', { name: 'Send', exact: true }).hasAttribute('disabled')).toBe(true)
    failHistory = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry messages' }))
    await history().findByText('Persisted hello')
  })
  it('discards a late response from the previously selected conversation', async () => {
    delayHistory = true
    open(`/messages/chat?conversation=${a}`)
    await waitFor(() => expect(holdHistory).not.toBeNull())
    fireEvent.click(await screen.findByRole('button', { name: /Jordan.*Say hello/ }))
    await history().findByText('No messages yet. Say hello.')
    await act(async () => { holdHistory?.() })
    expect(history().queryByText('Persisted hello')).toBeNull()
  })
  it('shows an honest empty inbox', async () => {
    empty = true; open()
    await screen.findByText('Your conversations start here')
    expect(screen.getByRole('link', { name: 'Find an event' })).toBeTruthy()
  })
  it('does not request messages before sign-in', () => {
    auth.session = null; open()
    expect(screen.getByText('Sign in to open your saved conversations.')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
