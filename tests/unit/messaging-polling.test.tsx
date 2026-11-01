import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClientProvider, focusManager } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Messages } from '../../src/ui/Messages'
import { createSessionQueryClient } from '../../src/data/query-client'

const api = vi.hoisted(() => ({ request: vi.fn(), group: vi.fn(), history: vi.fn(), read: vi.fn(), send: vi.fn(), groups: vi.fn() }))
vi.mock('../../src/features/messaging/client', () => ({ messagingRequest: api.request }))
vi.mock('../../src/ui/matching-client', () => ({ matchingClient: () => api }))
vi.mock('../../src/ui/current', () => ({ useCurrent: () => ({ session: { access_token: 'token', user: { id: 'me' } } }) }))
vi.mock('../../src/ui/ActiveFriends', () => ({ ActiveFriends: () => null, GroupControls: () => null }))
vi.mock('../../src/ui/Safety', () => ({ SafetyActions: () => null }))
vi.mock('../../src/ui/common', async importOriginal => {
  const original = await importOriginal<typeof import('../../src/ui/common')>()
  return { ...original, PersonPhoto: () => null }
})

const clients: ReturnType<typeof createSessionQueryClient>[] = []
const participants = [{ id: 'me', display_name: 'Me', last_read_seq: 0 }, { id: 'them', display_name: 'Friend', last_read_seq: 0 }]
const message = (seq: number, sender_id = 'them') => ({ id: `message-${seq}`, conversation_id: 'chat', sender_id, body: `Message ${seq}`, seq, created_at: '2026-10-31T12:00:00Z' })
let snapshot: { kind: 'direct'; canSend: boolean; messages: ReturnType<typeof message>[]; participants: typeof participants; nextCursor: number | null }
let failHistory = false
let pendingHistory: Promise<typeof snapshot> | undefined
const historyCalls = () => api.request.mock.calls.filter(([path, , options]) => path === '/chat/messages' && !options?.body)
const readCalls = () => api.request.mock.calls.filter(([path]) => path === '/chat/read')
async function tick(ms = 20) { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }
function open(group = false) {
  const client = createSessionQueryClient(); clients.push(client)
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/messages/chat?${group ? 'group' : 'conversation'}=chat`]}><Messages /></MemoryRouter></QueryClientProvider>)
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
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
  cleanup(); clients.splice(0).forEach(client => client.clear())
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
  await tick(4000)
  expect(screen.getByText('Message 2')).toBeTruthy()
  expect(composer.value).toBe('Unsent draft')
  expect(document.activeElement).toBe(composer)
  expect(readCalls()).toHaveLength(2)
  await tick(12000)
  expect(readCalls()).toHaveLength(2)
  // Read acknowledgement refreshes inboxes, not history, so it cannot drive a fetch/write loop.
  expect(historyCalls()).toHaveLength(5)
})

it('pauses hidden polling, resumes on visibility/focus and stops after unmount', async () => {
  const view = open(); await tick()
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
  act(() => { window.dispatchEvent(new Event('visibilitychange')) })
  const count = historyCalls().length
  snapshot = { ...snapshot, messages: [message(1), message(2)] }
  await tick(12000)
  expect(historyCalls()).toHaveLength(count)
  expect(readCalls()).toHaveLength(1)
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  act(() => { window.dispatchEvent(new Event('visibilitychange')) })
  await tick()
  expect(screen.getByText('Message 2')).toBeTruthy()
  expect(readCalls()).toHaveLength(2)
  const visibleCount = historyCalls().length
  act(() => { window.dispatchEvent(new Event('focus')) })
  await tick()
  expect(historyCalls().length).toBeGreaterThan(visibleCount)
  view.unmount()
  const finalCount = historyCalls().length
  await tick(12000)
  act(() => { window.dispatchEvent(new Event('focus')) })
  await tick()
  expect(historyCalls()).toHaveLength(finalCount)
})

it('retains history and editable draft through pending/failed polls without granting stale send permission', async () => {
  open(); await tick()
  const composer = screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement
  composer.focus(); fireEvent.change(composer, { target: { value: 'Keep this' } })
  let finish!: (value: typeof snapshot) => void
  pendingHistory = new Promise(resolve => { finish = resolve })
  await tick(4000)
  expect(composer.disabled).toBe(false)
  expect(document.activeElement).toBe(composer)
  expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true)
  await act(async () => { finish(snapshot) }); await tick()
  pendingHistory = undefined; failHistory = true
  await tick(4000)
  expect(screen.getByText('Message 1')).toBeTruthy()
  expect(composer.value).toBe('Keep this')
  expect(composer.disabled).toBe(false)
  fireEvent.submit(composer.form!)
  await tick()
  expect(api.request.mock.calls.filter(([, , options]) => options?.body && 'clientRequestId' in options.body)).toHaveLength(0)
  expect(readCalls()).toHaveLength(1)
  failHistory = false
  snapshot = { ...snapshot, canSend: false }
  await tick(4000)
  expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true)
  expect(composer.value).toBe('Keep this')
})

it('polls group history and updates read indicators without duplicate read writes', async () => {
  snapshot = { ...snapshot, messages: [message(1, 'me')] }
  open(true); await tick()
  expect(screen.getByText(/· Sent/)).toBeTruthy()
  snapshot = { ...snapshot, messages: [message(1, 'me'), message(2)], participants: participants.map(person => ({ ...person, last_read_seq: 2 })) }
  api.group.mockResolvedValue({ id: 'chat', name: 'Group', members: snapshot.participants })
  await tick(4000)
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
  await tick(4000)
  expect(screen.getByText('Message 0')).toBeTruthy()
  expect(screen.getByText('Message 2')).toBeTruthy()
  expect(log.scrollTop).toBe(100)
})

it('never retries uncertain sends on a poll and preserves the idempotency key for explicit retry', async () => {
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
  await tick(8000)
  expect(attempts).toBe(1)
  fireEvent.click(screen.getByRole('button', { name: 'Retry same message' })); await tick()
  const sends = api.request.mock.calls.filter(([path, , options]) => path === '/chat/messages' && options?.body)
  expect(sends).toHaveLength(2)
  expect(sends[0][2].body.clientRequestId).toBe(sends[1][2].body.clientRequestId)
  expect(composer.value).toBe('')
  expect(screen.getAllByText('Message 3')).toHaveLength(1)
})

it('retries failed read status on the next successful poll, then stops repeating the write', async () => {
  const original = api.request.getMockImplementation()!
  let attempts = 0
  api.request.mockImplementation(async (...args) => {
    if (args[0] === '/chat/read' && ++attempts === 1) throw new Error('Read failed')
    return original(...args)
  })
  open(); await tick()
  expect(screen.getByText(/Read status could not be saved/)).toBeTruthy()
  await tick(4000)
  expect(readCalls()).toHaveLength(2)
  expect(screen.queryByText(/Read status could not be saved/)).toBeNull()
  await tick(8000)
  expect(readCalls()).toHaveLength(2)
})
