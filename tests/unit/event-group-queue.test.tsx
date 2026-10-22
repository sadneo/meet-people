import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { EventGroupQueue } from '../../src/features/events/EventGroupQueue'
import { MatchingInbox } from '../../src/features/matchmaking/MatchingInbox'
import { Auth } from '../../src/features/prototype/Onboarding'
import { emptyAccount } from '../../shared/account'

const id = 'e0000000-0000-4000-8000-000000000001'
const actorId = 'a0000000-0000-4000-8000-000000000001'
const peer = 'a0000000-0000-4000-8000-000000000002'
const auth = vi.hoisted(() => ({ session: { access_token: 'user-jwt', user: { id: 'a0000000-0000-4000-8000-000000000001' } } as { access_token: string; user: { id: string } } | null }))
vi.mock('../../src/auth/useSession', () => ({ useSession: () => ({ session: auth.session, ready: true }) }))
vi.mock('../../src/supabase', () => ({ supabase: null }))
const profile = { username: 'sam', display_name: 'Sam', bio: null, birthdate: null, location_city: null, avatar_url: null, interests: [], availability: [] }
let queue: unknown, feed: unknown, saved: boolean, failLeave: boolean, failRead: boolean, queueUnavailable: boolean
let lateQueue: Promise<Response> | null, lateFeed: Promise<Response> | null, lateProfile: Promise<Response> | null
const requests: { path: string; method: string; token: string | null }[] = []
const notification = { id: peer, eventId: id, proposalId: actorId, title: 'Group proposal to review', createdAt: '2026-10-09T01:00:00Z', readAt: null }
beforeEach(() => {
  auth.session = { access_token: 'user-jwt', user: { id: actorId } }
  queue = { state: 'idle', proposal: null }; feed = { notifications: [], unreadCount: 0 }
  saved = true; failLeave = false; failRead = false; queueUnavailable = false; lateQueue = null; lateFeed = null; lateProfile = null; requests.length = 0
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input), method = init?.method ?? 'GET'
    requests.push({ path, method, token: new Headers(init?.headers).get('Authorization') })
    if (path.endsWith('/account')) return Response.json({ ...emptyAccount, completed: [0, 1, 2, 3] })
    if (path.endsWith('/profile')) return lateProfile ?? Response.json({ profile: saved ? profile : null })
    if (path.endsWith('/group-queue')) {
      if (queueUnavailable) return Response.json({ code: 'unavailable', error: 'Matching RPC is not available yet.' }, { status: 503 })
      if (method === 'POST') queue = { state: 'waiting', proposal: null }
      if (method === 'DELETE') {
        if (failLeave) return Response.json({ code: 'provider', error: 'Leave failed.' }, { status: 503 })
        queue = { state: 'idle', proposal: null }
      }
      return method === 'GET' && lateQueue ? lateQueue : Response.json(queue)
    }
    if (path.endsWith('/read')) {
      if (failRead) return Response.json({ code: 'provider', error: 'Read failed.' }, { status: 503 })
      feed = { notifications: [{ ...notification, readAt: '2026-10-09T02:00:00Z' }], unreadCount: 0 }
    }
    return method === 'GET' && lateFeed ? lateFeed : Response.json(feed)
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })
function Path() { return <output aria-label="Current path">{useLocation().pathname + useLocation().search}</output> }
const page = (listing = id) => <MemoryRouter><EventGroupQueue listingId={listing} /><Path /></MemoryRouter>
it('guest has one queue action to central sign-in, no inline email and no requests', () => {
  auth.session = null
  render(page())
  expect(screen.queryByLabelText('Email')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Find a group to go with' }))
  expect(screen.getByLabelText('Current path').textContent).toBe(`/login?returnTo=${encodeURIComponent(`/events/${id}`)}`)
  expect(requests).toHaveLength(0)
})
it('central callback returns signed-in account to a validated event path, never external URLs', async () => {
  const view = render(<MemoryRouter initialEntries={[`/login?returnTo=${encodeURIComponent(`/events/${id}`)}`]}><Auth /><Path /></MemoryRouter>)
  await waitFor(() => expect(screen.getByLabelText('Current path').textContent).toBe(`/events/${id}`))
  view.unmount()
  render(<MemoryRouter initialEntries={['/login?returnTo=https%3A%2F%2Fevil.test']}><Auth /><Path /></MemoryRouter>)
  await waitFor(() => expect(screen.getByLabelText('Current path').textContent).toBe('/'))
})
it('queue enrollment is persisted status only, refresh recovers waiting, and failed leave reconciles honestly', async () => {
  const view = render(page())
  await waitFor(() => expect(screen.getByRole('button', { name: 'Find a group to go with' }).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Find a group to go with' }))
  await screen.findByRole('button', { name: 'Leave queue' })
  expect(screen.getByText(/Background processing is not enabled/)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Review proposal' })).toBeNull()
  view.unmount(); render(page())
  await screen.findByRole('button', { name: 'Leave queue' })
  failLeave = true
  fireEvent.click(screen.getByRole('button', { name: 'Leave queue' }))
  await screen.findByRole('alert')
  expect(screen.getByText('You are in this event queue.')).toBeTruthy()
  expect(requests.every(request => request.path.endsWith('/group-queue') || request.path.endsWith('/profile'))).toBe(true)
  failLeave = false
  fireEvent.click(screen.getByRole('button', { name: 'Leave queue' }))
  await screen.findByText('Not in this event queue.')
})
it('saved profile is required for joining, but never for leaving an existing queue', async () => {
  saved = false
  const view = render(page())
  await screen.findByText('Not in this event queue.')
  expect(screen.getByRole('button', { name: 'Find a group to go with' }).disabled).toBe(true)
  expect(requests.some(request => request.method === 'POST')).toBe(false)
  view.unmount(); queue = { state: 'waiting', proposal: null }; render(page())
  fireEvent.click(await screen.findByRole('button', { name: 'Leave queue' }))
  await screen.findByText('Not in this event queue.')
})
it('missing queue RPC is 503-visible, never simulated waiting or a found group', async () => {
  queueUnavailable = true
  render(page())
  await screen.findByRole('alert')
  expect(screen.getByRole('button', { name: 'Find a group to go with' }).disabled).toBe(true)
  expect(screen.queryByRole('button', { name: 'Review proposal' })).toBeNull()
})
it('renders a genuine bounded proposal only after review, as a suggestion without RSVP/chat', async () => {
  queue = { state: 'proposal', proposal: { id: peer, eventId: id, members: [{ id: actorId, name: 'Sam', avatar: null }, { id: peer, name: 'Taylor', avatar: null }] } }
  render(page())
  fireEvent.click(await screen.findByRole('button', { name: 'Review proposal' }))
  expect(screen.getByText('Taylor')).toBeTruthy()
  expect(screen.getByText(/not a confirmed group/)).toBeTruthy()
  expect(requests.every(request => request.method === 'GET')).toBe(true)
})
it('drops late queue data after identity/event change', async () => {
  let finish!: (value: Response) => void
  lateQueue = new Promise(resolve => { finish = resolve })
  const view = render(page())
  lateQueue = null; auth.session = { access_token: 'other-jwt', user: { id: peer } }
  view.rerender(page(peer))
  await screen.findByText('Not in this event queue.')
  await act(async () => { finish(Response.json({ state: 'waiting', proposal: null })); await Promise.resolve() })
  expect(screen.queryByRole('button', { name: 'Leave queue' })).toBeNull()
})
it('polls only authenticated visible pages and only read-only status/profile requests', async () => {
  vi.useFakeTimers()
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
  render(page())
  await act(async () => { vi.advanceTimersByTime(60000) })
  expect(requests).toHaveLength(0)
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await Promise.resolve() })
  expect(requests.length).toBe(2)
  expect(requests.every(request => request.method === 'GET')).toBe(true)
})
it('inbox opening does not mark read; explicit view updates owned unread badge and canonical event link', async () => {
  feed = { notifications: [{ ...notification, email: 'private@example.test', actorId }], unreadCount: 1 }
  render(<MemoryRouter><MatchingInbox /><Path /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Matching notifications, 1 unread' }))
  expect(screen.getByRole('dialog', { name: 'Matching notifications' })).toBeTruthy()
  expect(screen.queryByText('private@example.test')).toBeNull()
  expect(requests.every(request => request.method === 'GET')).toBe(true)
  const link = screen.getByRole('link', { name: 'View proposal' })
  expect(link.getAttribute('href')).toBe(`/events/${id}`)
  fireEvent.click(link)
  await waitFor(() => expect(screen.getByLabelText('Current path').textContent).toBe(`/events/${id}`))
  expect(screen.getByRole('button', { name: 'Matching notifications, 0 unread' })).toBeTruthy()
  expect(requests.filter(request => request.method === 'POST')).toHaveLength(1)
})
it('failed read preserves unread notification and dialog; guest/session change clears stale inbox', async () => {
  feed = { notifications: [notification], unreadCount: 1 }; failRead = true
  const view = render(<MemoryRouter><MatchingInbox /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Matching notifications, 1 unread' }))
  fireEvent.click(screen.getByRole('link', { name: 'View proposal' }))
  await screen.findByRole('alert')
  expect(screen.getByRole('button', { name: 'Matching notifications, 1 unread' })).toBeTruthy()
  auth.session = null; view.rerender(<MemoryRouter><MatchingInbox /></MemoryRouter>)
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.queryByText(notification.title)).toBeNull()
})
it('ignores a late notification feed after signing out', async () => {
  let finish!: (value: Response) => void
  lateFeed = new Promise(resolve => { finish = resolve })
  const view = render(<MemoryRouter><MatchingInbox /></MemoryRouter>)
  auth.session = null; view.rerender(<MemoryRouter><MatchingInbox /></MemoryRouter>)
  await act(async () => { finish(Response.json({ notifications: [notification], unreadCount: 1 })); await Promise.resolve() })
  expect(screen.queryByRole('button')).toBeNull()
})
it('inbox remains dismissible during an uncertain read and a late reply cannot navigate after closing', async () => {
  feed = { notifications: [notification], unreadCount: 1 }
  render(<MemoryRouter><MatchingInbox /><Path /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Matching notifications, 1 unread' }))
  let finish!: (value: Response) => void
  vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  fireEvent.click(screen.getByRole('link', { name: 'View proposal' }))
  fireEvent.click(screen.getByRole('button', { name: 'Close matching notifications' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  await act(async () => { finish(Response.json({ notifications: [{ ...notification, readAt: '2026-10-09T02:00:00Z' }], unreadCount: 0 })); await Promise.resolve() })
  expect(screen.getByLabelText('Current path').textContent).toBe('/')
})
it('queue status and Leave/Refresh are operable without waiting for a hung profile', async () => {
  lateProfile = new Promise(() => {})
  queue = { state: 'waiting', proposal: null }
  render(page())
  const leave = await screen.findByRole('button', { name: 'Leave queue' })
  expect(leave.disabled).toBe(false)
  expect(screen.getByRole('button', { name: 'Refresh queue' }).disabled).toBe(false)
  fireEvent.click(leave)
  await screen.findByText('Not in this event queue.')
  expect(requests.filter(request => request.method === 'DELETE')).toHaveLength(1)
  expect(screen.getByRole('button', { name: 'Find a group to go with' }).disabled).toBe(true)
})
it('queue polling visibly disables conflicting actions until its bounded read settles', async () => {
  queue = { state: 'waiting', proposal: null }
  render(page())
  await screen.findByRole('button', { name: 'Leave queue' })
  let finish!: (value: Response) => void
  lateQueue = new Promise(resolve => { finish = resolve })
  fireEvent.click(screen.getByRole('button', { name: 'Refresh queue' }))
  expect(screen.getByRole('button', { name: 'Leave queue' }).disabled).toBe(true)
  expect(screen.getByRole('button', { name: 'Refresh queue' }).disabled).toBe(true)
  await act(async () => { finish(Response.json(queue)); await Promise.resolve() })
  expect(screen.getByRole('button', { name: 'Leave queue' }).disabled).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Leave queue' }))
  await screen.findByText('Not in this event queue.')
})
it('inbox polling explicitly disables View/Refresh instead of dropping an apparently enabled action', async () => {
  feed = { notifications: [notification], unreadCount: 1 }
  render(<MemoryRouter><MatchingInbox /><Path /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Matching notifications, 1 unread' }))
  let finish!: (value: Response) => void
  lateFeed = new Promise(resolve => { finish = resolve })
  fireEvent.click(screen.getByRole('button', { name: 'Refresh notifications' }))
  expect(screen.getByRole('link', { name: 'View proposal' }).getAttribute('aria-disabled')).toBe('true')
  expect(screen.getByRole('button', { name: 'Refresh notifications' }).disabled).toBe(true)
  fireEvent.click(screen.getByRole('link', { name: 'View proposal' }))
  expect(requests.filter(request => request.method === 'POST')).toHaveLength(0)
  await act(async () => { finish(Response.json(feed)); await Promise.resolve() })
  expect(screen.getByRole('link', { name: 'View proposal' }).getAttribute('aria-disabled')).toBe('false')
  fireEvent.click(screen.getByRole('link', { name: 'View proposal' }))
  await waitFor(() => expect(screen.getByLabelText('Current path').textContent).toBe(`/events/${id}`))
  expect(requests.filter(request => request.method === 'POST')).toHaveLength(1)
})
function stalledBody(signal: AbortSignal) {
  return new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode('{'))
    signal.addEventListener('abort', () => controller.error(new DOMException('synthetic abort', 'AbortError')), { once: true })
  } }))
}
it('profile body timeout disables joining but never takes away confirmed status or Leave/Refresh', async () => {
  vi.useFakeTimers()
  queue = { state: 'waiting', proposal: null }
  const fallback = vi.mocked(fetch).getMockImplementation()!
  let signal!: AbortSignal
  vi.mocked(fetch).mockImplementation((input, init) => {
    if (String(input).endsWith('/profile')) { signal = init!.signal as AbortSignal; return Promise.resolve(stalledBody(signal)) }
    return fallback(input, init)
  })
  render(page())
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  expect(screen.getByRole('button', { name: 'Leave queue' }).disabled).toBe(false)
  await act(async () => { await vi.advanceTimersByTimeAsync(15000) })
  expect(signal.aborted).toBe(true)
  expect(screen.getByRole('alert').textContent).toMatch(/timed out/i)
  expect(screen.getByText('You are in this event queue.')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Refresh queue' }).disabled).toBe(false)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Leave queue' })); await vi.advanceTimersByTimeAsync(0) })
  expect(screen.getByText('Not in this event queue.')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Find a group to go with' }).disabled).toBe(true)
})
it('queue body timeout preserves waiting and releases disabled polling controls for a real Leave', async () => {
  vi.useFakeTimers()
  queue = { state: 'waiting', proposal: null }
  render(page())
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  let signal!: AbortSignal
  // Refresh starts profile first; stall only the queue response body.
  const fallback = vi.mocked(fetch).getMockImplementation()!
  vi.mocked(fetch).mockReset().mockImplementation((input, init) => {
    if (String(input).endsWith('/group-queue') && init?.method === 'GET') { signal = init.signal as AbortSignal; return Promise.resolve(stalledBody(signal)) }
    return fallback(input, init)
  })
  fireEvent.click(screen.getByRole('button', { name: 'Refresh queue' }))
  expect(screen.getByRole('button', { name: 'Leave queue' }).disabled).toBe(true)
  await act(async () => { await vi.advanceTimersByTimeAsync(15000) })
  expect(signal.aborted).toBe(true)
  expect(screen.getByRole('alert').textContent).toMatch(/timed out/i)
  expect(screen.getByText('You are in this event queue.')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Leave queue' }).disabled).toBe(false)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Leave queue' })); await vi.advanceTimersByTimeAsync(0) })
  expect(screen.getByText('Not in this event queue.')).toBeTruthy()
})
it('timed-out feed polling restores explicit View; closing/reopening never makes a pending read look enabled', async () => {
  vi.useFakeTimers()
  feed = { notifications: [notification], unreadCount: 1 }
  render(<MemoryRouter><MatchingInbox /><Path /></MemoryRouter>)
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  fireEvent.click(screen.getByRole('button', { name: 'Matching notifications, 1 unread' }))
  let signal!: AbortSignal
  vi.mocked(fetch).mockImplementationOnce((_input, init) => { signal = init!.signal as AbortSignal; return Promise.resolve(stalledBody(signal)) })
  fireEvent.click(screen.getByRole('button', { name: 'Refresh notifications' }))
  fireEvent.click(screen.getByRole('button', { name: 'Close matching notifications' }))
  fireEvent.click(screen.getByRole('button', { name: 'Matching notifications, 1 unread' }))
  expect(screen.getByRole('link', { name: 'View proposal' }).getAttribute('aria-disabled')).toBe('true')
  await act(async () => { await vi.advanceTimersByTimeAsync(15000) })
  expect(signal.aborted).toBe(true)
  expect(screen.getByRole('button', { name: 'Matching notifications, 1 unread' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'View proposal' }).getAttribute('aria-disabled')).toBe('false')
  await act(async () => { fireEvent.click(screen.getByRole('link', { name: 'View proposal' })); await vi.advanceTimersByTimeAsync(0) })
  expect(screen.getByLabelText('Current path').textContent).toBe(`/events/${id}`)
  expect(requests.filter(request => request.method === 'POST')).toHaveLength(1)
})
