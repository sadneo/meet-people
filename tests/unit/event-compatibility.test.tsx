import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { EventCompatibility } from '../../src/features/events/EventCompatibility'

const auth = vi.hoisted(() => ({ session: { access_token: 'user-jwt' } as { access_token: string } | null }))
vi.mock('../../src/auth/useSession', () => ({ useSession: () => ({ session: auth.session, ready: true }) }))
const listingId = 'e0000000-0000-4000-8000-000000000001'
const profile = { username: 'sam', display_name: 'Sam', bio: null, birthdate: null, location_city: null, avatar_url: null, interests: [], availability: [] }
const candidate = { id: 'a0000000-0000-4000-8000-000000000002', name: 'Taylor', avatar: null, interests: ['Music'] }
let interested = false
let available = true
let saved = true
let failure: Response | null = null
let delayed: Promise<Response> | null = null
let matches: unknown = { candidates: [] }
const calls: { path: string; method: string; token: string | null }[] = []
beforeEach(() => {
  auth.session = { access_token: 'user-jwt' }
  interested = false; available = true; saved = true; failure = null; delayed = null; matches = { candidates: [] }; calls.length = 0
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input), method = init?.method ?? 'GET'
    calls.push({ path, method, token: new Headers(init?.headers).get('Authorization') })
    if (path.endsWith('/profile')) return Response.json({ profile: saved ? profile : null })
    if (failure) return failure.clone()
    if (path.endsWith('/matches')) return delayed ?? Response.json(matches)
    if (method === 'POST') interested = true
    if (method === 'DELETE') interested = false
    return Response.json({ isInterested: interested, available })
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const panel = (id = listingId) => <MemoryRouter><EventCompatibility listingId={id} /></MemoryRouter>
async function loaded() { await screen.findByText('You have not opted in to compatibility for this event.') }
it('requires sign-in without making compatibility or profile requests', () => {
  auth.session = null
  render(panel())
  expect(screen.getByRole('link', { name: 'Sign in' })).toBeTruthy()
  expect(calls).toHaveLength(0)
})
it('keeps matching consent separate and scores only after an explicit opted-in check', async () => {
  render(panel()); await loaded()
  expect(screen.getByRole('button', { name: 'Check event compatibility' }).disabled).toBe(true)
  expect(calls.some(call => call.path.endsWith('/matches'))).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Opt in to event compatibility' }))
  await screen.findByRole('button', { name: 'Withdraw compatibility opt-in' })
  expect(calls.some(call => call.path.endsWith('/matches'))).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Check event compatibility' }))
  await screen.findByText('No compatible people returned yet.')
  expect(calls.filter(call => call.path.endsWith('/matches'))).toHaveLength(1)
  expect(calls.every(call => call.token === 'Bearer user-jwt')).toBe(true)
  expect(calls.some(call => call.path.includes('/api/events'))).toBe(false)
})
it('requires a saved profile; unavailable events cannot opt in or score but can withdraw', async () => {
  saved = false; interested = true; available = false
  render(panel())
  await screen.findByText('You opted in to compatibility for this event.')
  expect(screen.getByRole('link', { name: 'matching profile' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Check event compatibility' }).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Withdraw compatibility opt-in' }))
  await loaded()
  expect(screen.getByRole('button', { name: 'Opt in to event compatibility' }).disabled).toBe(true)
  expect(calls.some(call => call.method === 'DELETE')).toBe(true)
  expect(calls.some(call => call.path.endsWith('/matches'))).toBe(false)
})
it('shows ranked suggestions without promises of groups, invitations or chats and clears them on withdrawal', async () => {
  interested = true
  matches = { candidates: [candidate, { ...candidate, id: listingId, name: 'Jordan' }] }
  render(panel())
  await screen.findByRole('button', { name: 'Withdraw compatibility opt-in' })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Check event compatibility' }).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Check event compatibility' }))
  await screen.findByText('Taylor')
  expect(screen.getAllByRole('listitem').map(item => item.querySelector('strong')?.textContent)).toEqual(['Taylor', 'Jordan'])
  fireEvent.click(screen.getByRole('button', { name: 'Withdraw compatibility opt-in' }))
  await loaded()
  expect(screen.queryByText('Taylor')).toBeNull()
})
for (const change of ['withdrawal', 'session', 'event']) {
  it(`discards a delayed compatibility result after ${change}`, async () => {
    interested = true
    let finish!: (value: Response) => void
    delayed = new Promise(resolve => { finish = resolve })
    const view = render(panel())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Check event compatibility' }).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: 'Check event compatibility' }))
    if (change === 'withdrawal') {
      fireEvent.click(screen.getByRole('button', { name: 'Withdraw compatibility opt-in' }))
      await loaded()
    } else {
      if (change === 'session') auth.session = { access_token: 'other-user-jwt' }
      view.rerender(panel(change === 'event' ? candidate.id : listingId))
    }
    await act(async () => { finish(Response.json({ candidates: [candidate] })); await delayed })
    expect(screen.queryByText('Taylor')).toBeNull()
    expect(calls.filter(call => call.path.endsWith('/matches'))).toHaveLength(1)
  })
}
it('shows missing RPC failure honestly; refresh is read-only and never scores', async () => {
  failure = Response.json({ code: 'unavailable', error: 'Matching RPC is not available yet.' }, { status: 503 })
  render(panel())
  await screen.findByRole('alert')
  expect(screen.getByRole('button', { name: 'Opt in to event compatibility' }).disabled).toBe(true)
  failure = null
  fireEvent.click(screen.getByRole('button', { name: 'Refresh compatibility status' }))
  await loaded()
  expect(calls.every(call => call.method === 'GET' && !call.path.endsWith('/matches'))).toBe(true)
})
it('keeps malformed match responses as errors, never as successful empty results', async () => {
  interested = true; matches = { candidates: null }
  render(panel())
  await waitFor(() => expect(screen.getByRole('button', { name: 'Check event compatibility' }).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Check event compatibility' }))
  await screen.findByRole('alert')
  expect(screen.queryByText('No compatible people returned yet.')).toBeNull()
})
