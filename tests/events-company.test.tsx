import { cleanup, fireEvent, render as renderView, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import type { Session } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Company } from '../src/features/events/Company'

const userId = 'a0000000-0000-4000-8000-000000000001'
function CurrentRoute() { const route = useLocation(); return <output aria-label="Current route">{route.pathname}{route.search}</output> }
function render(element: ReactElement) { return renderView(<MemoryRouter>{element}<CurrentRoute /></MemoryRouter>) }
const eventId = 'e0000000-0000-4000-8000-000000000001'
const session = { user: { id: userId, user_metadata: { display_name: 'Sam' } }, access_token: 'valid-token' } as Session
vi.mock('../src/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'valid-token' } } }) } } }))
let response = { interested: [] as { id: string; name: string }[], interestedCount: 0, isInterested: false, group: null as { id: string; members: { id: string; name: string }[] } | null }
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  if (String(input) === '/api/conversations') return new Response(JSON.stringify({ conversationId: 'c0000000-0000-4000-8000-000000000001' }))
  const action = init?.body ? JSON.parse(String(init.body)).action : null
  if (action === 'interest' || action === 'join') response = { ...response, interested: [{ id: userId, name: 'Sam' }], interestedCount: 1, isInterested: true }
  if (action === 'join') response.group = { id: 'b0000000-0000-4000-8000-000000000001', members: [{ id: userId, name: 'Sam' }] }
  if (action === 'leave') response.group = null
  return new Response(JSON.stringify(response), { headers: { 'Content-Type': 'application/json' } })
})
beforeEach(() => { response = { interested: [], interestedCount: 0, isInterested: false, group: null }; fetchMock.mockClear(); vi.stubGlobal('fetch', fetchMock) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('event company UI', () => {
  it('records interest, displays an honest singleton waiting state, and restores saved membership', async () => {
    const props = { id: eventId, title: 'Campus concert', session, authReady: true }
    const view = render(<Company {...props} />)
    await screen.findByText('Be the first to look for company.')
    fireEvent.click(screen.getByRole('button', { name: 'I’m interested' }))
    await screen.findByRole('button', { name: 'Remove my interest' })
    expect(screen.queryByText('Group formed')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Find someone to go with' }))
    await screen.findByText('Waiting for company')
    expect(screen.queryByText('Your event group is ready')).toBeNull()
    view.unmount()
    render(<Company {...props} />)
    await screen.findByText('Waiting for company')
    fireEvent.click(screen.getByRole('button', { name: 'Leave group' }))
    await screen.findByRole('button', { name: 'Find someone to go with' })
    expect(screen.queryByText('Waiting for company')).toBeNull()
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => String(init?.body).includes('leave'))).toBe(true))
  })
  it('shows a formed group only when the server returns another member', async () => {
    response.group = { id: 'b0000000-0000-4000-8000-000000000001', members: [{ id: userId, name: 'Sam' }, { id: 'a0000000-0000-4000-8000-000000000002', name: 'Taylor' }] }
    render(<Company id={eventId} title="Campus concert" session={session} authReady />)
    await screen.findByText('Your event group is ready')
    expect(screen.getByText('Taylor')).toBeTruthy()
  })
  it('does not fetch identities before sign-in', () => {
    render(<Company id={eventId} title="Campus concert" session={null} authReady />)
    expect(screen.getByText('Sign in to see interested people and find company.')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('opens the shared messaging backend using only the existing group ID', async () => {
    response.group = { id: 'b0000000-0000-4000-8000-000000000001', members: [{ id: userId, name: 'Sam' }, { id: 'a0000000-0000-4000-8000-000000000002', name: 'Taylor' }] }
    render(<Company id={eventId} title="Campus concert" session={session} authReady />)
    fireEvent.click(await screen.findByRole('button', { name: 'Message group' }))
    await waitFor(() => expect(screen.getByLabelText('Current route').textContent).toBe('/messages/chat?conversation=c0000000-0000-4000-8000-000000000001'))
    expect(fetchMock).toHaveBeenCalledWith('/api/conversations', expect.objectContaining({ method: 'POST', body: JSON.stringify({ eventGroupId: response.group!.id }) }))
  })
})
