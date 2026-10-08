import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'

const fixture = vi.hoisted(() => {
  const userId = 'a0000000-0000-4000-8000-000000000001'
  return { eventId: 'e0000000-0000-4000-8000-000000000001', userId,
    session: { user: { id: userId, user_metadata: { display_name: 'Sam' } }, access_token: 'test-session' } }
})
vi.mock('../src/auth/useSession', () => ({ useSession: () => ({ session: fixture.session, ready: true }) }))
vi.mock('../src/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: fixture.session } }) } } }))
const event = { id: fixture.eventId, title: 'Campus concert', description: null, category: 'Music', starts_at: '2099-10-02T15:00:00Z', ends_at: null, location_name: 'Student Union', address: null, city: 'Stony Brook', image_url: null, source: 'test', source_url: null, status: 'active', distance_miles: null, interested_count: 1 }
const sam = { id: fixture.userId, name: 'Sam' }
const taylor = { id: 'a0000000-0000-4000-8000-000000000002', name: 'Taylor' }
let group: { id: string; members: { id: string; name: string }[] } | null = null
const requests: { url: string; method: string; body: Record<string, unknown> | null; authorization: string | null }[] = []
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  const body = init?.body ? JSON.parse(String(init.body)) : null
  requests.push({ url, method: init?.method ?? 'GET', body, authorization: new Headers(init?.headers).get('Authorization') })
  if (url === `/api/events/${fixture.eventId}`) return Response.json(event)
  if (url !== `/api/events/${fixture.eventId}/company`) return Response.json({ error: 'Unexpected test request' }, { status: 404 })
  if (body?.action === 'join') group = { id: 'b0000000-0000-4000-8000-000000000001', members: [sam, taylor] }
  if (body?.action === 'leave') group = null
  return Response.json({ interested: [sam], interestedCount: 1, isInterested: true, group })
})
beforeEach(() => {
  group = null; requests.length = 0; fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('scrollTo', () => {})
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
function CurrentPath() { return <output aria-label="Current path">{useLocation().pathname}</output> }

describe('event matchmaking integration', () => {
  it('renders the server-returned group and stays on the event route', async () => {
    render(<MemoryRouter initialEntries={[`/events/${fixture.eventId}`]}><App /><CurrentPath /></MemoryRouter>)
    const join = await screen.findByRole('button', { name: 'Find someone to go with' })
    expect(screen.queryByText('Taylor')).toBeNull()
    fireEvent.click(join)
    await screen.findByRole('heading', { name: 'Your event group is ready' })
    expect(screen.getByText('Sam (you)')).toBeTruthy()
    expect(screen.getByText('Taylor')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Campus concert' })).toBeTruthy()
    expect(screen.getByLabelText('Current path').textContent).toBe(`/events/${fixture.eventId}`)
    expect(screen.queryByRole('heading', { name: 'Find your people' })).toBeNull()
    expect(screen.getAllByRole('link', { name: 'Events' }).every(link => link.getAttribute('aria-current') === 'page')).toBe(true)
    expect(requests.find(request => request.body?.action === 'join')).toMatchObject({ url: `/api/events/${fixture.eventId}/company`, method: 'POST', body: { action: 'join', name: 'Sam' }, authorization: 'Bearer test-session' })
  })
  it('leaves the group through the API and returns to the event company prompt', async () => {
    render(<MemoryRouter initialEntries={[`/events/${fixture.eventId}`]}><App /><CurrentPath /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Find someone to go with' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Leave group' }))
    await screen.findByRole('heading', { name: 'Find your company' })
    expect(screen.getByRole('button', { name: 'Find someone to go with' })).toBeTruthy()
    expect(screen.queryByText('Taylor')).toBeNull()
    expect(screen.getByLabelText('Current path').textContent).toBe(`/events/${fixture.eventId}`)
    expect(requests.find(request => request.body?.action === 'leave')).toMatchObject({ method: 'POST', body: { action: 'leave', name: 'Sam' } })
  })
})
