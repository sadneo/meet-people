import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'
import { requiredPreferences } from './complete-profile-fixture'
vi.mock('../src/supabase', () => ({ supabase: null }))
vi.mock('../src/auth/useSession', () => ({ useSession: () => ({ ready: true, session: { access_token: 'route-fixture', user: { id: 'route-fixture' } } }) }))
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('scrollTo', () => {})
  vi.stubGlobal('fetch', vi.fn(async input => Response.json(String(input).endsWith('/account-profile') ? { profile: { username: 'route-fixture', display_name: 'Route fixture', bio: null, avatar_url: null } } : String(input).endsWith('/notifications') ? { notifications: [], unreadCount: 0 } : String(input).endsWith('/profile') ? { profile: { username: 'route-fixture', display_name: 'Route fixture', bio: null, avatar_url: null, ...requiredPreferences } } : { mode: null })))
})

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })
async function appReady() { await waitFor(() => expect(screen.queryByText('Checking your profile…')).toBeNull()) }

function CurrentPath() {
  return <output aria-label="Current path">{useLocation().pathname}</output>
}

describe('routes', () => {
  it('renders the home route', async () => {
    render(
      <MemoryRouter initialEntries={['/']}><App /></MemoryRouter>,
    )

    await appReady()
    expect(screen.getByRole('heading', { name: 'Who’s around?' })).toBeTruthy()
  })

  it('opens the dedicated interactive matchmaking page from the prototype homepage', async () => {
    render(<MemoryRouter initialEntries={['/']}><App /><CurrentPath /></MemoryRouter>)
    await appReady()

    fireEvent.click(screen.getByRole('link', { name: 'Find people' }))

    expect(screen.getByRole('heading', { name: 'Active matchmaking' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Sign in to match' })).toBeNull()
    expect(await screen.findByRole('button', { name: 'Preferences' })).toBeTruthy()
    expect(screen.getByLabelText('Current path').textContent).toBe('/matchmaking')
  })

  it('shows Matchmaking before Events and opens active matchmaking', async () => {
    render(<MemoryRouter initialEntries={['/']}><App /><CurrentPath /></MemoryRouter>)
    await appReady()

    const desktopNavigation = screen.getAllByRole('navigation', { name: 'Primary navigation' })[0]
    const links = Array.from(desktopNavigation.querySelectorAll('a')).map(link => link.textContent)
    expect(links).toEqual(['Home', 'Matchmaking', 'Events', 'Messages'])

    fireEvent.click(screen.getAllByRole('link', { name: 'Matchmaking' })[0])
    expect(screen.getByLabelText('Current path').textContent).toBe('/matchmaking')
    expect(screen.getByRole('heading', { name: 'Active matchmaking' })).toBeTruthy()
    expect(screen.getAllByRole('link', { name: 'Matchmaking' }).every(link => link.getAttribute('aria-current') === 'page')).toBe(true)
  })

  it('keeps the Matchmaking tab active on downtime matchmaking', async () => {
    render(<MemoryRouter initialEntries={['/downtime-matchmaking']}><App /></MemoryRouter>)
    await appReady()
    expect(screen.getAllByRole('link', { name: 'Matchmaking' }).every(link => link.getAttribute('aria-current') === 'page')).toBe(true)
  })

  it('opens standalone downtime matchmaking from the prototype homepage', async () => {
    render(<MemoryRouter initialEntries={['/']}><App /><CurrentPath /></MemoryRouter>)
    await appReady()

    fireEvent.click(screen.getByRole('link', { name: 'Downtime matchmaking' }))

    expect(screen.getByRole('heading', { name: 'Manage downtime in Settings' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open matchmaking settings' }).getAttribute('href')).toBe('/settings')
    expect(screen.getByLabelText('Current path').textContent).toBe('/downtime-matchmaking')
  })

  it('hides Free Time from navigation but preserves its direct route', async () => {
    const view = render(<MemoryRouter initialEntries={['/matchmaking']}><App /></MemoryRouter>)
    await appReady()
    expect(screen.queryByRole('link', { name: 'Free Time' })).toBeNull()

    view.unmount()
    render(<MemoryRouter initialEntries={['/free-time']}><App /></MemoryRouter>)
    await appReady()
    expect(screen.getByRole('heading', { name: 'Who’s free?' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Free Time' })).toBeNull()
  })

  it('renders canonical product routes', async () => {
    render(<MemoryRouter initialEntries={['/events']}><App /></MemoryRouter>)
    await appReady()

    expect(screen.getByRole('heading', { name: 'Events' })).toBeTruthy()
  })

  it.each(['/prototype', '/prototype?scene=events'])('removes %s', async path => {
    render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
    await appReady()

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeTruthy()
  })

  it('opens Community from Home without changing the primary destinations', async () => {
    render(<MemoryRouter initialEntries={['/']}><App /><CurrentPath /></MemoryRouter>)
    await appReady()
    fireEvent.click(screen.getByRole('link', { name: 'Community', exact: true }))
    expect(screen.getByRole('link', { name: 'Back to Home' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Community' })).toBeNull()
    expect(screen.getByLabelText('Current path').textContent).toBe('/community')
    expect(screen.getAllByRole('link', { name: 'Home', exact: true }).every(link => link.getAttribute('aria-current') === 'page')).toBe(true)
  })

  it('renders the not-found route', async () => {
    render(<MemoryRouter initialEntries={['/missing']}><App /></MemoryRouter>)
    await appReady()

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeTruthy()
  })
})
