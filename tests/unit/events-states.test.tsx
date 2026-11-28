import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { EventDetail, Events } from '../../src/ui/Events'

vi.mock('../../src/supabase', () => ({ supabase: null }))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const base = { id: '11111111-1111-4111-8111-111111111111', source: 'qa', distance_miles: null, title: 'Festival', description: 'd', category: 'Music', status: 'active', image_url: null, source_url: null, location_name: 'Park', address: null, city: 'Town', ends_at: new Date(Date.now() + 5 * 3600e3).toISOString() }
function stub(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })))
}
function wrap(ui: React.ReactNode, path = '/events') {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter></QueryClientProvider>)
}

it('labels a started event and hides the find-people promise on its card', async () => {
  stub(200, { events: [{ ...base, starts_at: new Date(Date.now() - 3600e3).toISOString() }, { ...base, id: '22222222-2222-4222-8222-222222222222', title: 'Later', starts_at: new Date(Date.now() + 86400e3).toISOString() }], categories: [], page: 1, hasMore: false })
  wrap(<Events />)
  await screen.findByText('Festival')
  expect(screen.getAllByText('Happening now')).toHaveLength(1)
  expect(screen.getAllByText('Find people looking for company')).toHaveLength(1)
})

it('hides the find-people line on a started event detail', async () => {
  stub(200, { ...base, starts_at: new Date(Date.now() - 3600e3).toISOString() })
  wrap(<Routes><Route path="/events/:id" element={<EventDetail />} /></Routes>, '/events/11111111-1111-4111-8111-111111111111')
  await screen.findByText('Festival')
  expect(screen.queryByText('Find people looking for company')).toBeNull()
})

it('explains an unavailable event calmly without a reload button', async () => {
  stub(404, { error: 'This event is no longer available.' })
  wrap(<Routes><Route path="/events/:id" element={<EventDetail />} /></Routes>, '/events/11111111-1111-4111-8111-111111111111')
  await screen.findByText('This event is no longer available')
  expect(screen.getByRole('link', { name: 'Browse events' }).getAttribute('href')).toBe('/events')
  expect(screen.queryByRole('button', { name: /reload/i })).toBeNull()
})

it('keeps reload for temporary failures', async () => {
  stub(500, { error: 'Events are unavailable. Try again.' })
  wrap(<Routes><Route path="/events/:id" element={<EventDetail />} /></Routes>, '/events/11111111-1111-4111-8111-111111111111')
  await waitFor(() => expect(screen.getByRole('button', { name: /reload/i })).toBeTruthy())
})
