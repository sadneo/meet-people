import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MatchingViews } from '../src/features/matchmaking/MatchingViews'

// Component contracts, not application access: App access is tested separately.
function App() { const { pathname } = useLocation(); return <MatchingViews mode={pathname === '/downtime-matchmaking' ? 'downtime' : 'active'} /> }

vi.mock('../src/supabase', () => ({ supabase: null }))
const auth = vi.hoisted(() => ({ ready: true, session: { access_token: 'test-jwt', user: { id: 'a0000000-0000-4000-8000-000000000001' } } as { access_token: string; user: { id: string } } | null }))
vi.mock('../src/auth/useSession', () => ({ useSession: () => auth }))
const hook = vi.hoisted(() => vi.fn())
vi.mock('../src/features/matchmaking/useMatchmaking', async importOriginal => {
  const original = await importOriginal<typeof import('../src/features/matchmaking/useMatchmaking')>()
  return { ...original, useMatchmaking: (token: string) => { hook(); return original.useMatchmaking(token) } }
})
let saved = false
const profile = { username: 'fixture', display_name: 'Fixture', bio: null, avatar_url: null, birthdate: null, location_city: null, interests: ['Coffee'], availability: [] }
const fetchMock = vi.fn(async (input: RequestInfo | URL) => Response.json(String(input).endsWith('/account-profile') ? { profile: null } : String(input).endsWith('/profile') ? { profile: saved ? profile : null } : { mode: null }))
beforeEach(() => {
  auth.ready = true; auth.session = { access_token: 'test-jwt', user: { id: 'a0000000-0000-4000-8000-000000000001' } }
  saved = false; hook.mockClear(); fetchMock.mockClear(); vi.stubGlobal('fetch', fetchMock); vi.stubGlobal('scrollTo', () => {})
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })
function History() {
  const location = useLocation(), navigate = useNavigate()
  return <><output aria-label="URL">{location.pathname}{location.search}</output><button onClick={() => navigate(-1)}>History back</button></>
}
for (const query of ['', '?view=unknown']) {
  it(`active Friends safely renders ${query || 'default'} with selector but no Dating behavior or automatic queue writes/lookups`, async () => {
    render(<MemoryRouter initialEntries={[`/matchmaking${query}`]}><App /></MemoryRouter>)
    await screen.findByRole('button', { name: 'Find Friends', exact: true })
    expect(screen.getByRole('navigation', { name: 'Matching views' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Dating', exact: true }).getAttribute('href')).toBe('/matchmaking?view=dating')
    expect(screen.queryByRole('heading', { name: 'Dating in your downtime' })).toBeNull()
    expect(hook).toHaveBeenCalled()
    expect(fetchMock.mock.calls.every(([input]) => !String(input).includes('dating') && !String(input).endsWith('/queue') && !String(input).endsWith('/result'))).toBe(true)
  })
}
for (const state of ['missing', 'saved', 'signed-out', 'loading']) {
  it(`main selector persists without product Settings shortcuts while ${state}`, async () => {
    saved = state === 'saved'
    if (state === 'signed-out') auth.session = null
    if (state === 'loading') auth.ready = false
    const view = render(<MemoryRouter initialEntries={['/matchmaking']}><App /></MemoryRouter>)
    if (state === 'missing') await screen.findByRole('heading', { name: 'Find your people' })
    if (state === 'saved') await screen.findByRole('button', { name: 'Preferences', exact: true })
    expect(screen.getByRole('link', { name: 'Friends', exact: true }).getAttribute('href')).toBe('/matchmaking')
    expect(screen.getByRole('link', { name: 'Friends', exact: true }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Dating', exact: true }).getAttribute('href')).toBe('/matchmaking?view=dating')
    expect(view.container.querySelectorAll('.match-home a[href="/settings"]')).toHaveLength(0)
    expect(screen.queryByRole('link', { name: 'Matchmaking settings', exact: true })).toBeNull()
  })
}
const path = '/downtime-matchmaking'
for (const state of ['authenticated', 'signed-out', 'loading']) {
  it(`shared downtime navigation remains unique through Friends/Dating switching while ${state}`, async () => {
    if (state === 'signed-out') auth.session = null
    if (state === 'loading') auth.ready = false
    render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
    const navigation = () => screen.getByRole('navigation', { name: 'Matching modes', exact: true })
    expect(navigation().querySelectorAll('a')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Active matchmaking', exact: true }).getAttribute('href')).toBe('/matchmaking')
    fireEvent.click(screen.getByRole('link', { name: 'Dating', exact: true }))
    expect(navigation().querySelectorAll('a')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Active matchmaking', exact: true }).getAttribute('href')).toBe('/matchmaking')
    expect((screen.getByRole('button', { name: 'Find a date in your downtime', exact: true }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('link', { name: 'Active matchmaking', exact: true }))
    expect(screen.queryByRole('link', { name: 'Matchmaking settings', exact: true })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Downtime matchmaking', exact: true })).toBeNull()
    expect(screen.getByRole('navigation', { name: 'Matching views' })).toBeTruthy()
  })
}
it('legacy Friends downtime offers Settings without duplicate start/setup or queue hooks', async () => {
  render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
  await screen.findByRole('heading', { name: 'Manage downtime in Settings', exact: true })
  expect(screen.getByRole('link', { name: 'Open matchmaking settings', exact: true }).getAttribute('href')).toBe('/settings')
  expect(screen.queryByRole('button', { name: 'Turn on downtime matching', exact: true })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Set up matching preferences', exact: true })).toBeNull()
  expect(hook).not.toHaveBeenCalled()
  expect(fetchMock.mock.calls.every(([input]) => !String(input).endsWith('/queue') && !String(input).endsWith('/result'))).toBe(true)
})
for (const datingPath of ['/matchmaking', path]) {
  it(`${datingPath} Dating deep link has the existing unavailable content without matching hooks/requests`, () => {
    const view = render(<MemoryRouter initialEntries={[`${datingPath}?view=dating`]}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Dating in your downtime' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('Dating backend not connected')
    const purpose = screen.getByRole('region', { name: 'Dating in your downtime' })
    const actions = purpose.querySelectorAll('button')
    expect(actions).toHaveLength(1)
    expect((screen.getByRole('button', { name: 'Find a date in your downtime', exact: true }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('link', { name: 'Dating', exact: true }).getAttribute('aria-current')).toBe('page')
    expect(view.container.querySelector('.dating-mascot .pt-pixel-pebble')?.getAttribute('data-expression')).toBe('happy')
    expect(view.container.querySelectorAll('.dating-mascot .pt-pixel-pebble image')).toHaveLength(1)
    expect(view.container.querySelector('.dating-heart-thought')?.getAttribute('aria-hidden')).toBe('true')
    expect(view.container.querySelector('.dating-romantic-card')).toBeNull()
    expect(screen.getByText(/Free time in common/)).toBeTruthy()
    expect(hook).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
}
  it('downtime preserves other query parameters and native history between views', async () => {
    render(<MemoryRouter initialEntries={[`${path}?source=home&view=dating`]}><App /><History /></MemoryRouter>)
    fireEvent.click(screen.getByRole('link', { name: 'Friends', exact: true }))
    await screen.findByRole('heading', { name: 'Manage downtime in Settings', exact: true })
    expect(hook).not.toHaveBeenCalled()
    expect(screen.getByLabelText('URL').textContent).toBe(`${path}?source=home`)
    fireEvent.click(screen.getByRole('button', { name: 'History back' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Dating in your downtime' })).toBeTruthy())
    expect(screen.getByLabelText('URL').textContent).toBe(`${path}?source=home&view=dating`)
  })
  it('downtime defaults unknown views to Friends', async () => {
    render(<MemoryRouter initialEntries={[`${path}?view=unknown`]}><App /></MemoryRouter>)
    await screen.findByRole('heading', { name: 'Manage downtime in Settings', exact: true })
    expect(screen.getByRole('link', { name: 'Friends', exact: true }).getAttribute('aria-current')).toBe('page')
  })
