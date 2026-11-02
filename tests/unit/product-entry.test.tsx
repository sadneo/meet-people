import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Web from '../../src/web/App'
import Mobile from '../../src/mobile/App'

vi.mock('../../src/supabase', () => ({ supabase: null }))

function Location() {
  return <output aria-label="Current URL">{useLocation().pathname}</output>
}
beforeEach(() => { vi.stubEnv('DEV', false); vi.stubEnv('VITE_DEV_TOOLS', 'false') })
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })

it.each(['/', '/login', '/messages', '/auth/callback'])('web %s stays public and links out to the mobile app without an auth form', async path => {
  render(<MemoryRouter initialEntries={[path]}><Web /><Location /></MemoryRouter>)
  expect(await screen.findByRole('heading', { name: /Meet new friends/ })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Open Google Play for Android' }).getAttribute('href')).toBe('https://play.google.com/store/apps')
  expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('https://mobile.dev.pebble.garden')
  expect(screen.queryByRole('button', { name: 'Continue with email' })).toBeNull()
  expect(screen.getByLabelText('Current URL').textContent).toBe('/')
})

it('landing previews remain ephemeral and never call APIs or touch account storage', async () => {
  const fetch = vi.fn(), write = vi.spyOn(Storage.prototype, 'setItem')
  vi.stubGlobal('fetch', fetch)
  render(<MemoryRouter><Web /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Dating', exact: true }))
  expect(screen.getByRole('img', { name: /Maya, a fictional Dating profile/ }).getAttribute('src')).toBe('/garden/preview-maya.jpg')
  fireEvent.click(screen.getByRole('button', { name: 'Add trees to Garden preview' }))
  expect(screen.getByRole('img', { name: /Garden, with trees added/ })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Add flowers to Garden preview' }))
  expect(screen.getByRole('button', { name: 'Add trees to Garden preview' }).getAttribute('aria-pressed')).toBe('false')
  fireEvent.click(screen.getByRole('button', { name: 'Remove flowers from Garden preview' }))
  expect(screen.getByRole('img', { name: 'A customizable pixel Garden' })).toBeTruthy()
  expect(fetch).not.toHaveBeenCalled()
  expect(write).not.toHaveBeenCalled()
  write.mockRestore()
})

it('web event browsing reads the registry without private group controls', async () => {
  const event = {
    id: 'a0000000-0000-4000-8000-000000000001', title: 'Campus coffee walk',
    description: 'Meet at the library.', category: 'Social', starts_at: '2099-01-01T12:00:00Z', ends_at: null,
    location_name: 'Library', address: null, city: null, image_url: null,
    source: 'campus', source_url: 'https://example.com/event', status: 'active', distance_miles: null,
  }
  const fetch = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('?')
    ? { events: [event], categories: ['Social'], page: 1, hasMore: false }
    : event)))
  vi.stubGlobal('fetch', fetch)
  render(<MemoryRouter initialEntries={['/explore']}><Web /></MemoryRouter>)
  expect(await screen.findByRole('heading', { name: event.title })).toBeTruthy()
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/events?'), expect.anything())
  expect(screen.getByRole('link', { name: 'Get Pebble' }).getAttribute('href')).toBe('/#install')
  fireEvent.click(screen.getByRole('link', { name: 'Campus coffee walk: see event and people' }))
  expect(await screen.findByText('Meet at the library.')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Get Pebble to find a group' }).getAttribute('href')).toBe('/#install')
  expect(screen.queryByRole('button', { name: 'Join group queue' })).toBeNull()
  expect(fetch.mock.calls.every(([url]) => url.startsWith('/api/events'))).toBe(true)
})

it('signed-out mobile opens directly at login', async () => {
  render(<MemoryRouter><Mobile /><Location /></MemoryRouter>)
  expect(await screen.findByRole('button', { name: 'Continue with email' })).toBeTruthy()
  expect(screen.getByLabelText('Current URL').textContent).toBe('/login')
  expect(screen.queryByRole('heading', { name: /Meet new friends/ })).toBeNull()
})
