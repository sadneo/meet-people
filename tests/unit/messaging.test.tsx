import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import App from '../../src/App'
import type { Message, Participant } from '../../shared/messaging'

const auth = vi.hoisted(() => ({ session: { access_token: 'real-session', user: { id: 'a0000000-0000-4000-8000-000000000001' } } as Session | null }))
vi.mock('../../src/auth/useSession', () => ({ useSession: () => ({ session: auth.session, ready: true }) }))
// Accounts and onboarding have their own tests; here the signed-in user is already set up.
vi.mock('../../src/auth/useUnifiedAccount', () => ({ useUnifiedAccount: () => ({
  loading: false, available: true, busy: false, error: '', save: vi.fn(), reload: vi.fn(),
  account: {
    profile: { username: 'synthetic-owner', display_name: 'Synthetic owner', bio: 'Synthetic bio', birthdate: '2000-01-01', location_city: 'Synthetic campus', avatar_url: null, interests: ['Art', 'Coffee', 'Music'], availability: [{ dow: 1, start_time: '12:00:00', end_time: '17:00:00' }] },
    preferences: { intents: ['Activity partners'], usual: [], distance: 'Nearby', group: 'One-on-one' },
    settings: { notifications: false, availability: false, discoverable: true, location: false }, completed: [0, 1, 2, 3],
  },
}) }))
vi.mock('../../src/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'real-session' } } }) } } }))
const user = 'a0000000-0000-4000-8000-000000000001'
const taylor = 'a0000000-0000-4000-8000-000000000002'
const jordan = 'a0000000-0000-4000-8000-000000000003'
const riley = 'a0000000-0000-4000-8000-000000000004'
const a = 'c0000000-0000-4000-8000-000000000001'
const b = 'c0000000-0000-4000-8000-000000000002'
const c = 'c0000000-0000-4000-8000-000000000003'
const first: Message = { id: 'b0000000-0000-4000-8000-000000000001', conversation_id: a, seq: 1, sender_id: taylor, body: 'Persisted hello', created_at: '2026-10-08T12:00:00Z' }
let saved: Message[] = []
let unread: Record<string, number> = {}
let taylorRead = 0
let canSend = true
let incoming: { id: string; display_name: string; avatar_url: null; requested_at: string }[] = []
let sent: typeof incoming = []
let rileyChat = false
let failSend = false
let failHistory = false
let historyStatus = 200
let sendStatus = 200
let failSendNetwork = false
let removedConversations: string[] = []
let paginated = false
let empty = false
let resolveSend: (() => void) | null = null
let delaySend = false
let holdHistory: (() => void) | null = null
let delayHistory = false
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
function participants(id: string): Participant[] {
  return [{ id: user, display_name: 'Sam', avatar_url: null, last_read_seq: 0 }, id === a ? { id: taylor, display_name: 'Taylor', avatar_url: null, last_read_seq: taylorRead } : id === c ? { id: riley, display_name: 'Riley', avatar_url: null, last_read_seq: 0 } : { id: jordan, display_name: 'Jordan', avatar_url: null, last_read_seq: 0 }]
}
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input), 'http://app.test')
  if (url.pathname === '/api/connections') return json({ incoming, sent, connected: [] })
  if (url.pathname.startsWith('/api/connections/')) {
    incoming = incoming.filter(person => !url.pathname.includes(person.id))
    return json(url.pathname.endsWith('/accept') ? { status: 'connected', conversationId: a } : { status: 'none', conversationId: null })
  }
  if (url.pathname === '/api/conversations/activity') return json({ unreadConversations: Object.values(unread).filter(count => count > 0).length, incomingRequests: incoming.length })
  const id = url.pathname.split('/')[3]
  const inConversation = saved.filter(message => message.conversation_id === id)
  if (init?.method === 'POST') {
    const payload = JSON.parse(String(init.body))
    if (url.pathname.endsWith('/read')) { unread[id] = 0; return json({ lastReadSeq: payload.seq }) }
    if (url.pathname.endsWith('/leave')) return new Response(null, { status: 204 })
    if (delaySend) await new Promise<void>(resolve => { resolveSend = resolve })
    if (failSendNetwork) throw new TypeError('Failed to fetch')
    if (sendStatus !== 200) return json({ error: 'You are not in this conversation.' }, sendStatus)
    if (failSend) return json({ error: 'Could not send.' }, 503)
    const message = { ...first, id: crypto.randomUUID(), conversation_id: id, seq: (inConversation.at(-1)?.seq ?? 0) + 1, sender_id: user, body: payload.body.trim() }
    saved.push(message)
    return json(message)
  }
  if (url.pathname.endsWith('/messages')) {
    if (historyStatus !== 200) return json({ error: 'You are not in this conversation.' }, historyStatus)
    if (id === a && delayHistory) await new Promise<void>(resolve => { holdHistory = resolve })
    if (failHistory) return json({ error: 'History unavailable.' }, 503)
    const after = Number(url.searchParams.get('after') ?? 0)
    return json({ kind: id === b ? 'event_group' : 'direct', canSend, messages: inConversation.filter(message => message.seq > after), participants: participants(id), nextCursor: null })
  }
  const pageIds = paginated ? (url.searchParams.get('page') === '2' ? [b] : [a]) : [a, b, ...(rileyChat ? [c] : [])]
  return json({ conversations: empty ? [] : pageIds.filter(id => !removedConversations.includes(id)).map(id => ({ id, kind: id === b ? 'event_group' : 'direct', created_at: first.created_at, participants: participants(id), latest_message: saved.filter(message => message.conversation_id === id).at(-1) ?? null, unread_count: unread[id] ?? 0 })), hasMore: paginated && url.searchParams.get('page') !== '2' })
})
beforeEach(() => {
  saved = [first]; unread = { [a]: 1 }; taylorRead = 0; canSend = true; incoming = []; sent = []; rileyChat = false
  failSend = false; failHistory = false; empty = false; delaySend = false; resolveSend = null; delayHistory = false; holdHistory = null
  historyStatus = 200; sendStatus = 200; failSendNetwork = false; removedConversations = []; paginated = false
  auth.session = { access_token: 'real-session', user: { id: user } } as Session
  vi.stubGlobal('fetch', fetchMock); fetchMock.mockClear()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })
function CurrentRoute() { const route = useLocation(); return <output aria-label="Current route">{route.pathname}{route.search}</output> }
function open(path = '/messages') { return render(<MemoryRouter initialEntries={[path]}><App /><CurrentRoute /></MemoryRouter>) }
function history() { return within(screen.getByRole('region', { name: 'Message history' })) }
const posts = (suffix: string) => fetchMock.mock.calls.filter(([input, init]) => init?.method === 'POST' && String(input).endsWith(suffix))
const messagesTabs = () => screen.getAllByRole('link', { name: 'Messages', exact: true })

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
    expect(posts('/messages')).toHaveLength(1)
    expect(posts('/messages')[0][1]?.headers).toMatchObject({ Authorization: 'Bearer real-session' })
    view.unmount(); open(`/messages/chat?conversation=${a}`)
    await history().findByText('M3 messaging persistence test')
    fireEvent.click(await screen.findByRole('button', { name: /Jordan.*Say hello/ }))
    await history().findByText('No messages yet. Say hello.')
    expect(history().queryByText('M3 messaging persistence test')).toBeNull()
  })
  it('shows unread conversations and marks the newest message read when opened', async () => {
    open()
    const row = await screen.findByRole('button', { name: /Taylor.*Persisted hello/ })
    expect(within(row).getByRole('img', { name: '1 unread' })).toBeTruthy()
    fireEvent.click(row)
    await waitFor(() => expect(posts('/read')).toHaveLength(1))
    expect(JSON.parse(String(posts('/read')[0][1]?.body))).toEqual({ seq: 1 })
    expect(screen.queryByRole('img', { name: /unread/ })).toBeNull()
  })
  it('picks up new messages by polling after the newest one shown', async () => {
    open(`/messages/chat?conversation=${a}`)
    await history().findByText('Persisted hello')
    await waitFor(() => expect(posts('/read').some(([, init]) => JSON.parse(String(init?.body)).seq === 1)).toBe(true))
    saved.push({ ...first, id: 'b0000000-0000-4000-8000-000000000002', seq: 2, body: 'Are you still coming?' })
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    await history().findByText('Are you still coming?')
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith(`/${a}/messages?after=1`))).toBe(true)
    expect(history().getAllByText('Persisted hello')).toHaveLength(1)
  })
  it('shows when the other person has seen my latest message', async () => {
    saved.push({ ...first, id: 'b0000000-0000-4000-8000-000000000002', seq: 2, sender_id: user, body: 'See you there' })
    taylorRead = 2
    open(`/messages/chat?conversation=${a}`)
    await history().findByText('See you there')
    expect(history().getByText('Seen')).toBeTruthy()
  })
  it('updates the inbox preview as soon as an open chat receives a message', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    open(`/messages/chat?conversation=${a}`)
    await history().findByText('Persisted hello')
    await waitFor(() => expect(posts('/read').some(([, init]) => JSON.parse(String(init?.body)).seq === 1)).toBe(true))
    saved.push({ ...first, id: crypto.randomUUID(), seq: 2, body: 'Fresh incoming preview' })
    await act(() => vi.advanceTimersByTimeAsync(5000))
    await history().findByText('Fresh incoming preview')
    expect(screen.getByRole('button', { name: /Taylor.*Fresh incoming preview/ })).toBeTruthy()
  })
  it.each([403, 404])('disables a chat and explains when access ends during polling (%s)', async status => {
    open(`/messages/chat?conversation=${a}`)
    await history().findByText('Persisted hello')
    historyStatus = status
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    await screen.findByText('You are not in this conversation.')
    expect(screen.getByLabelText('Message', { exact: true }).hasAttribute('disabled')).toBe(true)
    expect(screen.queryByRole('button', { name: /Taylor.*Persisted hello/ })).toBeNull()
  })
  it('keeps a newer sent preview when an older chat poll finishes afterward', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    open(`/messages/chat?conversation=${a}`)
    await history().findByText('Persisted hello')
    await waitFor(() => expect(posts('/read').some(([, init]) => JSON.parse(String(init?.body)).seq === 1)).toBe(true))
    saved.push({ ...first, id: crypto.randomUUID(), seq: 2, body: 'Older incoming message' })
    delayHistory = true
    await act(() => vi.advanceTimersByTimeAsync(5000))
    expect(holdHistory).not.toBeNull()
    fireEvent.change(screen.getByLabelText('Message', { exact: true }), { target: { value: 'Newer sent message' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send', exact: true }))
    await history().findByText('Newer sent message')
    await act(async () => { holdHistory?.() })
    await history().findByText('Older incoming message')
    expect(screen.getByRole('button', { name: /Taylor.*Newer sent message/ })).toBeTruthy()
  })
  it('removes ended conversations during polling while retaining loaded later pages', async () => {
    paginated = true
    open()
    await screen.findByRole('button', { name: /Taylor.*Persisted hello/ })
    fireEvent.click(screen.getByRole('button', { name: 'Load more conversations' }))
    await screen.findByRole('button', { name: /Jordan.*Say hello/ })
    removedConversations = [a]
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    await waitFor(() => expect(screen.queryByRole('button', { name: /Taylor/ })).toBeNull())
    expect(screen.getByRole('button', { name: /Jordan.*Say hello/ })).toBeTruthy()
  })
  it('does not reenable a denied chat when an earlier successful poll finishes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    open(`/messages/chat?conversation=${a}`)
    await history().findByText('Persisted hello')
    delayHistory = true
    await act(() => vi.advanceTimersByTimeAsync(5000))
    expect(holdHistory).not.toBeNull()
    sendStatus = 403
    fireEvent.change(screen.getByLabelText('Message', { exact: true }), { target: { value: 'Unsent message' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send', exact: true }))
    await screen.findByText('You are not in this conversation.')
    await act(async () => { holdHistory?.() })
    expect(screen.getByLabelText('Message', { exact: true }).hasAttribute('disabled')).toBe(true)
  })
  it('labels messages from deleted accounts and disables sending when the conversation is closed', async () => {
    saved = [{ ...first, sender_id: null }]
    canSend = false
    open(`/messages/chat?conversation=${a}`)
    await history().findByText('Persisted hello')
    expect(history().getByText('Deleted user')).toBeTruthy()
    expect(screen.getByText('You can’t send messages in this conversation.')).toBeTruthy()
    expect(screen.getByLabelText('Message', { exact: true }).hasAttribute('disabled')).toBe(true)
  })
  it('leaves a group conversation after confirmation', async () => {
    open(`/messages/chat?conversation=${b}`)
    await history().findByText('No messages yet. Say hello.')
    fireEvent.click(screen.getByRole('button', { name: 'Leave conversation' }))
    fireEvent.click(screen.getByRole('button', { name: 'Leave', exact: true }))
    await waitFor(() => expect(screen.getByLabelText('Current route').textContent).toBe('/messages'))
    expect(posts('/leave')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /Jordan/ })).toBeNull()
  })
  it('offers no leave control for direct conversations', async () => {
    open(`/messages/chat?conversation=${a}`)
    await history().findByText('Persisted hello')
    expect(screen.queryByRole('button', { name: 'Leave conversation' })).toBeNull()
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
    const bodies = posts('/messages').map(([, init]) => JSON.parse(String(init?.body)))
    expect(bodies[0].clientRequestId).toBe(bodies[1].clientRequestId)
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
  it('explains network send failures without browser diagnostics and preserves the draft', async () => {
    failSendNetwork = true
    open(`/messages/chat?conversation=${a}`)
    await history().findByText('Persisted hello')
    fireEvent.change(screen.getByLabelText('Message', { exact: true }), { target: { value: 'Keep this draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send', exact: true }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Could not send your message.')
    expect(alert.textContent).not.toContain('Failed to fetch')
    expect((screen.getByLabelText('Message', { exact: true }) as HTMLInputElement).value).toBe('Keep this draft')
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
  it('shows an honest empty inbox that points to finding people', async () => {
    empty = true; open()
    await screen.findByText('Your conversations start here')
    expect(screen.getByText('A conversation opens when you connect with someone.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Find people' }).getAttribute('href')).toBe('/matchmaking')
  })
  it('accepts a connection request from the inbox and opens the new chat', async () => {
    incoming = [{ id: riley, display_name: 'Riley', avatar_url: null, requested_at: first.created_at }]
    open()
    const requests = await screen.findByRole('region', { name: 'Connection requests' })
    expect(within(requests).getByText('Riley')).toBeTruthy()
    fireEvent.click(within(requests).getByRole('button', { name: 'Accept' }))
    await waitFor(() => expect(screen.getByLabelText('Current route').textContent).toBe(`/messages/chat?conversation=${a}`))
    expect(posts(`/api/connections/${riley}/accept`)).toHaveLength(1)
    expect(screen.queryByRole('region', { name: 'Connection requests' })).toBeNull()
  })
  it('shows the new chat to the person who sent the request soon after it is accepted', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    sent = [{ id: riley, display_name: 'Riley', avatar_url: null, requested_at: first.created_at }]
    open()
    await screen.findByRole('button', { name: /Taylor.*Persisted hello/ })
    sent = []; rileyChat = true
    await act(() => vi.advanceTimersByTimeAsync(5000))
    await screen.findByRole('button', { name: /Riley.*Say hello/ })
    // With nothing waiting any more, the inbox goes back to its slower checks.
    const inboxLoads = () => fetchMock.mock.calls.filter(([input]) => String(input) === '/api/conversations?page=1').length
    const settled = inboxLoads()
    await act(() => vi.advanceTimersByTimeAsync(5000))
    expect(inboxLoads()).toBe(settled)
  })
  it('declines a connection request without opening anything', async () => {
    incoming = [{ id: riley, display_name: 'Riley', avatar_url: null, requested_at: first.created_at }]
    open()
    fireEvent.click(within(await screen.findByRole('region', { name: 'Connection requests' })).getByRole('button', { name: 'Decline' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Connection requests' })).toBeNull())
    expect(fetchMock.mock.calls.some(([input, init]) => init?.method === 'DELETE' && String(input) === `/api/connections/${riley}`)).toBe(true)
    expect(screen.getByLabelText('Current route').textContent).toBe('/messages')
  })
  it('marks Messages in navigation while something is unread, and clears it once read', async () => {
    open('/events')
    await waitFor(() => expect(messagesTabs().every(tab => tab.querySelector('.pt-nav-activity'))).toBe(true))
    expect(messagesTabs()[0].getAttribute('title')).toBe('Messages · new activity')
    fireEvent.click(messagesTabs()[0])
    fireEvent.click(await screen.findByRole('button', { name: /Taylor.*Persisted hello/ }))
    await waitFor(() => expect(messagesTabs().some(tab => tab.querySelector('.pt-nav-activity'))).toBe(false))
  })
  it('sends signed-out visitors to central sign-in without requesting messages', () => {
    auth.session = null; open(`/messages/chat?conversation=${a}`)
    expect(screen.getByRole('heading', { name: 'Welcome to Pebble', exact: true })).toBeTruthy()
    expect(screen.getByLabelText('Current route').textContent).toBe(`/login?returnTo=${encodeURIComponent(`/messages/chat?conversation=${a}`)}`)
    expect(screen.queryByRole('region', { name: 'Conversation inbox' })).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
