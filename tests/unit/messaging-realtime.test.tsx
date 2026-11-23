import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { focusManager } from '@tanstack/react-query'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import { SessionQueryProvider } from '../../src/data/SessionQueryProvider'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Messages } from '../../src/ui/Messages'

const api = vi.hoisted(() => ({ request: vi.fn(), group: vi.fn(), history: vi.fn(), read: vi.fn(), send: vi.fn(), groups: vi.fn() }))
const identity = vi.hoisted(() => ({ id: 'me' }))
vi.mock('../../src/features/messaging/client', () => ({ messagingRequest: api.request }))
vi.mock('../../src/ui/matching-client', () => ({ matchingClient: () => api }))
vi.mock('../../src/ui/current', () => ({ useCurrent: () => ({ session: { access_token: 'token', user: { id: identity.id } } }) }))
vi.mock('../../src/ui/ActiveFriends', () => ({ ActiveFriends: () => null, GroupControls: () => null }))
vi.mock('../../src/ui/Safety', () => ({ SafetyActions: () => null }))
vi.mock('../../src/ui/common', async importOriginal => {
  const original = await importOriginal<typeof import('../../src/ui/common')>()
  return { ...original, PersonPhoto: () => null }
})

const realtime = vi.hoisted(() => ({ channel: vi.fn(), removeChannel: vi.fn(), broadcast: undefined as undefined | (() => void), status: undefined as undefined | ((status: string) => void) }))
vi.mock('../../src/supabase', () => ({ supabase: realtime }))

async function incoming() { act(() => { realtime.broadcast?.() }); await tick(100) }

const participants = [{ id: 'me', display_name: 'Me', last_read_seq: 0 }, { id: 'them', display_name: 'Friend', last_read_seq: 0 }]
const message = (seq: number, sender_id = 'them') => ({ id: `message-${seq}`, conversation_id: 'chat', sender_id, body: `Message ${seq}`, seq, created_at: '2026-10-31T12:00:00Z' })
let snapshot: { kind: 'direct'; canSend: boolean; messages: ReturnType<typeof message>[]; participants: typeof participants; nextCursor: number | null }
let failHistory = false
let pendingHistory: Promise<typeof snapshot> | undefined
const historyCalls = () => api.request.mock.calls.filter(([path, , options]) => path === '/chat/messages' && !options?.body)
const readCalls = () => api.request.mock.calls.filter(([path]) => path === '/chat/read')
async function tick(ms = 100) { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }
function open(group = false) {
  return render(<SessionQueryProvider scope="me"><MemoryRouter initialEntries={[`/messages/chat?${group ? 'group' : 'conversation'}=chat`]}><Messages /></MemoryRouter></SessionQueryProvider>)
}
function openNavigable() {
  return render(<SessionQueryProvider scope="me"><MemoryRouter initialEntries={['/messages/chat?conversation=chat']}><Link to="/elsewhere">Other tab</Link><Link to="/messages/chat?conversation=chat">Open direct</Link><Link to="/messages/chat?group=chat">Open group</Link><Routes><Route path="/messages/*" element={<Messages />} /><Route path="/elsewhere" element={<p>Other tab content</p>} /></Routes></MemoryRouter></SessionQueryProvider>)
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  identity.id = 'me'
  realtime.removeChannel.mockResolvedValue('ok')
  realtime.broadcast = undefined; realtime.status = undefined
  realtime.channel.mockImplementation(() => {
    const channel = {
      on: (_type: string, filter: { event: string }, callback: () => void) => { if (filter.event === 'changed') realtime.broadcast = callback; return channel },
      subscribe: (callback: (status: string) => void) => { realtime.status = callback; return channel },
    }
    return channel
  })
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  focusManager.setFocused(undefined)
  snapshot = { kind: 'direct', canSend: true, messages: [message(1)], participants: participants.map(person => ({ ...person })), nextCursor: null }
  failHistory = false; pendingHistory = undefined
  api.request.mockImplementation(async (path: string, _schema: unknown, options?: { body?: unknown }) => {
    if (path === '?page=1') return { conversations: [], hasMore: false }
    if (path === '/activity') return { incomingRequests: 0 }
    if (path === '/chat/read') return {}
    if (path === '/chat/messages?before=1') return { ...snapshot, messages: [message(0)], nextCursor: null }
    if (path === '/chat/messages' && !options?.body) {
      if (failHistory) throw new Error('Temporarily unavailable')
      return pendingHistory ?? snapshot
    }
    if (path === '/chat/messages' && options?.body) return message(3, 'me')
    throw new Error(`Unexpected request: ${path}`)
  })
  api.groups.mockResolvedValue({ groups: [] })
  api.group.mockResolvedValue({ id: 'chat', name: 'Group', members: participants })
  api.history.mockImplementation(async () => snapshot)
  api.read.mockResolvedValue({})
})
afterEach(() => {
  cleanup()
  vi.useRealTimers(); vi.restoreAllMocks()
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  focusManager.setFocused(undefined)
})

it('receives incoming direct messages without Refresh, preserves draft/focus and posts each read sequence only once', async () => {
  open(); await tick()
  const composer = screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement
  composer.focus(); fireEvent.change(composer, { target: { value: 'Unsent draft' } })
  expect(readCalls()).toHaveLength(1)
  snapshot = { ...snapshot, messages: [message(1), message(2)] }
  await incoming()
  expect(screen.getByText('Message 2')).toBeTruthy()
  expect(composer.value).toBe('Unsent draft')
  expect(document.activeElement).toBe(composer)
  expect(readCalls()).toHaveLength(2)
  await tick(12000)
  expect(readCalls()).toHaveLength(2)
  // Read acknowledgement refreshes inboxes, not history, so it cannot drive a fetch/write loop.
  expect(historyCalls()).toHaveLength(2)
})

it('defers hidden notifications, catches up on visibility/focus and stops after unmount', async () => {
  const view = open(); await tick()
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
  act(() => { document.dispatchEvent(new Event('visibilitychange')) })
  const count = historyCalls().length
  snapshot = { ...snapshot, messages: [message(1), message(2)] }
  await incoming(); await tick(12000)
  expect(historyCalls()).toHaveLength(count)
  expect(readCalls()).toHaveLength(1)
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  act(() => { document.dispatchEvent(new Event('visibilitychange')) })
  await tick()
  expect(screen.getByText('Message 2')).toBeTruthy()
  expect(readCalls()).toHaveLength(2)
  const visibleCount = historyCalls().length
  act(() => { window.dispatchEvent(new Event('focus')) })
  await tick()
  expect(historyCalls().length).toBeGreaterThan(visibleCount)
  view.unmount()
  expect(realtime.removeChannel).toHaveBeenCalledTimes(1)
  const finalCount = historyCalls().length
  act(() => { realtime.broadcast?.(); realtime.status?.('SUBSCRIBED') })
  await tick(12000)
  act(() => { window.dispatchEvent(new Event('focus')) })
  await tick()
  expect(historyCalls()).toHaveLength(finalCount)
})

it('retains history and editable draft through pending/failed realtime refreshes without granting stale send permission', async () => {
  open(); await tick()
  const composer = screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement
  composer.focus(); fireEvent.change(composer, { target: { value: 'Keep this' } })
  let finish!: (value: typeof snapshot) => void
  pendingHistory = new Promise(resolve => { finish = resolve })
  await incoming()
  expect(composer.disabled).toBe(false)
  expect(document.activeElement).toBe(composer)
  expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true)
  await act(async () => { finish(snapshot) }); await tick()
  pendingHistory = undefined; failHistory = true
  await incoming()
  expect(screen.getByText('Message 1')).toBeTruthy()
  expect(composer.value).toBe('Keep this')
  expect(composer.disabled).toBe(false)
  fireEvent.submit(composer.form!)
  await tick()
  expect(api.request.mock.calls.filter(([, , options]) => options?.body && 'clientRequestId' in options.body)).toHaveLength(0)
  expect(readCalls()).toHaveLength(1)
  failHistory = false
  snapshot = { ...snapshot, canSend: false }
  await incoming()
  expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true)
  expect(composer.value).toBe('Keep this')
})

it('refreshes group history on notifications and updates read indicators without duplicate read writes', async () => {
  snapshot = { ...snapshot, messages: [message(1, 'me')] }
  open(true); await tick()
  expect(screen.getByText(/· Sent/)).toBeTruthy()
  snapshot = { ...snapshot, messages: [message(1, 'me'), message(2)], participants: participants.map(person => ({ ...person, last_read_seq: 2 })) }
  api.group.mockResolvedValue({ id: 'chat', name: 'Group', members: snapshot.participants })
  await incoming()
  expect(screen.getByText('Message 2')).toBeTruthy()
  expect(screen.getByText(/· Read/)).toBeTruthy()
  expect(api.read).toHaveBeenCalledTimes(2)
  await tick(8000)
  expect(api.read).toHaveBeenCalledTimes(2)
})

it('keeps loaded earlier messages and does not scroll a reader away from older history', async () => {
  snapshot = { ...snapshot, nextCursor: 1 }
  open(); await tick()
  fireEvent.click(screen.getByRole('button', { name: 'Load earlier messages' })); await tick()
  const log = screen.getByRole('log')
  Object.defineProperties(log, { scrollHeight: { configurable: true, value: 2000 }, clientHeight: { configurable: true, value: 500 } })
  log.scrollTop = 100
  snapshot = { ...snapshot, messages: [message(1), message(2)] }
  await incoming()
  expect(screen.getByText('Message 0')).toBeTruthy()
  expect(screen.getByText('Message 2')).toBeTruthy()
  expect(log.scrollTop).toBe(100)
})

it('never retries uncertain sends on a notification and preserves the idempotency key for explicit retry', async () => {
  const original = api.request.getMockImplementation()!
  let attempts = 0
  api.request.mockImplementation(async (...args) => {
    if (args[0] === '/chat/messages' && args[2]?.body) {
      attempts++
      if (attempts === 1) throw new Error('Delivery uncertain')
    }
    return original(...args)
  })
  open(); await tick()
  const composer = screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement
  fireEvent.change(composer, { target: { value: 'Message 3' } })
  fireEvent.submit(composer.form!)
  fireEvent.submit(composer.form!)
  await tick()
  expect(attempts).toBe(1)
  await incoming(); await tick(8000)
  expect(attempts).toBe(1)
  fireEvent.click(screen.getByRole('button', { name: 'Retry same message' })); await tick()
  const sends = api.request.mock.calls.filter(([path, , options]) => path === '/chat/messages' && options?.body)
  expect(sends).toHaveLength(2)
  expect(sends[0][2].body.clientRequestId).toBe(sends[1][2].body.clientRequestId)
  expect(composer.value).toBe('')
  expect(screen.getAllByText('Message 3')).toHaveLength(1)
})

it('retries failed read status on the next successful notification, then stops repeating the write', async () => {
  const original = api.request.getMockImplementation()!
  let attempts = 0
  api.request.mockImplementation(async (...args) => {
    if (args[0] === '/chat/read' && ++attempts === 1) throw new Error('Read failed')
    return original(...args)
  })
  open(); await tick()
  expect(screen.getByText(/Read status could not be saved/)).toBeTruthy()
  await incoming()
  expect(readCalls()).toHaveLength(2)
  expect(screen.queryByText(/Read status could not be saved/)).toBeNull()
  await tick(8000)
  expect(readCalls()).toHaveLength(2)
})

it('preserves a lost-ack operation across inbox and other tabs, blocks failed permissions, and retries only explicitly with the same ID', async () => {
  const original = api.request.getMockImplementation()!
  let attempts = 0
  api.request.mockImplementation(async (...args) => {
    if (args[0] === '/chat/messages' && args[2]?.body) {
      attempts++
      if (attempts === 1) {
        snapshot = { ...snapshot, messages: [...snapshot.messages, { ...message(3, 'me'), body: args[2].body.body }] }
        throw new Error('Lost acknowledgement')
      }
      return snapshot.messages.at(-1)
    }
    return original(...args)
  })
  openNavigable(); await tick()
  fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'Repeated text' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' })); await tick()
  fireEvent.click(screen.getByRole('link', { name: 'Back to conversations' })); await tick()
  fireEvent.click(screen.getByRole('link', { name: 'Open direct' })); await tick()
  expect(screen.getByRole('button', { name: 'Retry same message' })).toBeTruthy()
  fireEvent.click(screen.getByRole('link', { name: 'Other tab' })); await tick()
  failHistory = true
  fireEvent.click(screen.getByRole('link', { name: 'Open direct' })); await tick()
  expect((screen.getByRole('button', { name: 'Retry same message' }) as HTMLButtonElement).disabled).toBe(true)
  expect(attempts).toBe(1)
  failHistory = false; await incoming()
  expect(attempts).toBe(1)
  fireEvent.click(screen.getByRole('button', { name: 'Retry same message' })); await tick()
  const sends = api.request.mock.calls.filter(([, , options]) => options?.body?.clientRequestId)
  expect(sends).toHaveLength(2)
  expect(sends[0][2].body).toEqual(sends[1][2].body)
  expect((screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement).value).toBe('')
  fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'Repeated text' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' })); await tick()
  const repeated = api.request.mock.calls.filter(([, , options]) => options?.body?.clientRequestId)
  expect(repeated[2][2].body.clientRequestId).not.toBe(repeated[1][2].body.clientRequestId)
})

it('keeps pending sends locked after remount and clears a late success even while another tab is open', async () => {
  const original = api.request.getMockImplementation()!
  let finish!: (value: ReturnType<typeof message>) => void
  api.request.mockImplementation(async (...args) => {
    if (args[0] === '/chat/messages' && args[2]?.body) return new Promise(resolve => { finish = resolve })
    return original(...args)
  })
  openNavigable(); await tick()
  fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'Message 3' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' })); await tick()
  fireEvent.click(screen.getByRole('link', { name: 'Other tab' })); await tick()
  fireEvent.click(screen.getByRole('link', { name: 'Open direct' })); await tick()
  expect((screen.getByRole('button', { name: 'Sending…' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.submit((screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement).form!)
  expect(api.request.mock.calls.filter(([, , options]) => options?.body?.clientRequestId)).toHaveLength(1)
  fireEvent.click(screen.getByRole('link', { name: 'Other tab' })); await tick()
  await act(async () => { finish(message(3, 'me')) }); await tick()
  fireEvent.click(screen.getByRole('link', { name: 'Open direct' })); await tick()
  expect((screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement).value).toBe('')
  expect(screen.getByText('Message 3')).toBeTruthy()
})

it('retains group retries independently of a direct conversation with the same ID', async () => {
  api.send.mockRejectedValueOnce(new Error('Lost acknowledgement')).mockResolvedValue(message(3, 'me'))
  openNavigable(); await tick()
  fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'Direct draft' } })
  fireEvent.click(screen.getByRole('link', { name: 'Open group' })); await tick()
  expect((screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement).value).toBe('')
  fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'Message 3' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' })); await tick()
  fireEvent.click(screen.getByRole('link', { name: 'Other tab' })); await tick()
  fireEvent.click(screen.getByRole('link', { name: 'Open direct' })); await tick()
  expect((screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement).value).toBe('Direct draft')
  fireEvent.click(screen.getByRole('link', { name: 'Open group' })); await tick()
  await tick(8000)
  expect(api.send).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Retry same message' })); await tick()
  expect(api.send).toHaveBeenCalledTimes(2)
  expect(api.send.mock.calls[0]).toEqual(api.send.mock.calls[1])
  expect((screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement).value).toBe('')
})

it('catches up on subscribe/reconnect, coalesces bursts, and displays connection failures', async () => {
  open(); await tick()
  expect(realtime.channel).toHaveBeenCalledWith('messaging:me', { config: { private: true } })
  act(() => { realtime.status?.('CHANNEL_ERROR') }); await tick()
  expect(screen.getByText(/Live updates are unavailable/)).toBeTruthy()
  snapshot = { ...snapshot, messages: [message(1), message(2)] }
  act(() => { realtime.status?.('SUBSCRIBED'); realtime.broadcast?.(); realtime.broadcast?.() }); await tick(100)
  expect(screen.queryByText(/Live updates are unavailable/)).toBeNull()
  expect(screen.getByText('Message 2')).toBeTruthy()
  expect(historyCalls()).toHaveLength(2)
  await incoming()
  expect(readCalls()).toHaveLength(2)
})

it('does not lose a notification arriving during an in-flight history read', async () => {
  let finish!: (value: typeof snapshot) => void
  const originalSnapshot = snapshot
  pendingHistory = new Promise(resolve => { finish = resolve })
  open(); await tick()
  snapshot = { ...snapshot, messages: [message(1), message(2)] }
  await incoming()
  pendingHistory = undefined
  await act(async () => { finish(originalSnapshot) }); await tick(100)
  expect(screen.getByText('Message 2')).toBeTruthy()
  expect(historyCalls()).toHaveLength(2)
})

it('waits for the previous channel to leave before an explicit reconnect', async () => {
  open(); await tick()
  let finish!: () => void
  realtime.removeChannel.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
  act(() => { realtime.status?.('CHANNEL_ERROR') }); await tick()
  fireEvent.click(screen.getByRole('button', { name: 'Reconnect live updates' })); await tick()
  expect(realtime.channel).toHaveBeenCalledTimes(1)
  await act(async () => { finish() }); await tick()
  expect(realtime.channel).toHaveBeenCalledTimes(2)
  act(() => { realtime.status?.('SUBSCRIBED') }); await tick()
  expect(screen.queryByText(/Live updates are unavailable/)).toBeNull()
})

it('removes the old account subscription and ignores its late callbacks', async () => {
  const view = open(); await tick()
  const oldBroadcast = realtime.broadcast!, oldStatus = realtime.status!
  identity.id = 'other'
  view.rerender(<SessionQueryProvider scope="other"><MemoryRouter><Messages /></MemoryRouter></SessionQueryProvider>); await tick()
  expect(realtime.removeChannel).toHaveBeenCalledTimes(1)
  expect(realtime.channel).toHaveBeenLastCalledWith('messaging:other', { config: { private: true } })
  const calls = api.request.mock.calls.length
  act(() => { oldBroadcast(); oldStatus('CHANNEL_ERROR') }); await tick()
  expect(api.request.mock.calls).toHaveLength(calls)
  expect(screen.queryByText(/Live updates are unavailable/)).toBeNull()
})

it('shows a closed conversation with a neutral name, no read call and a disabled composer', async () => {
  snapshot = { ...snapshot, canSend: false, participants: [participants[0], { id: 'them', display_name: 'Account 22222222-2222-4222-8222-222222222222', last_read_seq: 0 }] }
  open(); await tick()
  expect(screen.getByRole('heading', { name: 'Unavailable account' })).toBeTruthy()
  expect(screen.queryByText(/Account 2222/)).toBeNull()
  expect(readCalls()).toHaveLength(0)
  expect(screen.queryByText(/Read status could not be saved/)).toBeNull()
  expect(screen.getByText(/This conversation is closed/)).toBeTruthy()
  expect((screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement).disabled).toBe(true)
})

it('keeps the draft editable after a definite 4xx rejection', async () => {
  const original = api.request.getMockImplementation()!
  api.request.mockImplementation(async (...args) => {
    if (args[0] === '/chat/messages' && args[2]?.body) throw Object.assign(new Error('Rejected'), { status: 422 })
    return original(...args)
  })
  open(); await tick()
  const composer = screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement
  fireEvent.change(composer, { target: { value: 'Too long' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' })); await tick()
  expect(composer.disabled).toBe(false)
  expect(screen.queryByRole('button', { name: 'Retry same message' })).toBeNull()
  expect(screen.getByText(/Couldn’t send/)).toBeTruthy()
})

it('leaves an unconfirmed send editable with a plain Retry and a Discard', async () => {
  const original = api.request.getMockImplementation()!
  api.request.mockImplementation(async (...args) => {
    if (args[0] === '/chat/messages' && args[2]?.body) throw new Error('offline')
    return original(...args)
  })
  open(); await tick()
  const composer = screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement
  fireEvent.change(composer, { target: { value: 'Hello' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' })); await tick()
  expect(composer.disabled).toBe(false)
  expect(screen.getByText(/Not sent/)).toBeTruthy()
  expect(screen.queryByText(/request ID/i)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
  expect(composer.value).toBe('')
  expect(screen.queryByRole('button', { name: 'Retry same message' })).toBeNull()
})
