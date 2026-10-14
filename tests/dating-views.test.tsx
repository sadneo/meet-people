import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from '../src/App'

vi.mock('../src/supabase', () => ({ supabase: null }))
vi.mock('../src/auth/useSession', () => ({ useSession: () => ({ ready: true, session: { access_token: 'test-jwt', user: { id: 'a0000000-0000-4000-8000-000000000001' } } }) }))
const hook = vi.hoisted(() => vi.fn())
vi.mock('../src/features/matchmaking/useMatchmaking', async importOriginal => {
  const original = await importOriginal<typeof import('../src/features/matchmaking/useMatchmaking')>()
  return { ...original, useMatchmaking: (token: string) => { hook(); return original.useMatchmaking(token) } }
})
const fetchMock = vi.fn(async (input: RequestInfo | URL) => Response.json(String(input).endsWith('/profile') ? { profile: null } : { mode: null }))
beforeEach(() => { hook.mockClear(); fetchMock.mockClear(); vi.stubGlobal('fetch', fetchMock); vi.stubGlobal('scrollTo', () => {}) })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })
function History() {
  const location = useLocation(), navigate = useNavigate()
  return <><output aria-label="URL">{location.pathname}{location.search}</output><button onClick={() => navigate(-1)}>History back</button></>
}
for (const query of ['', '?view=dating', '?view=unknown']) {
  it(`active Friends only safely renders ${query || 'default'} without Dating controls or automatic queue writes/lookups`, async () => {
    render(<MemoryRouter initialEntries={[`/matchmaking${query}`]}><App /></MemoryRouter>)
    await screen.findByRole('button', { name: 'Start matching', exact: true })
    expect(screen.queryByRole('navigation', { name: 'Matching views' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Dating', exact: true })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Dating in your downtime' })).toBeNull()
    expect(hook).toHaveBeenCalled()
    expect(fetchMock.mock.calls.every(([input]) => !String(input).includes('dating') && !String(input).endsWith('/queue') && !String(input).endsWith('/result'))).toBe(true)
  })
}
const path = '/downtime-matchmaking'
  it('downtime Dating deep link has focal PixelPebble, restrained romantic detail and one disabled action without matching hooks/requests', () => {
    const view = render(<MemoryRouter initialEntries={[`${path}?view=dating`]}><App /></MemoryRouter>)
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
  it('downtime preserves other query parameters and native history between views', async () => {
    render(<MemoryRouter initialEntries={[`${path}?source=home&view=dating`]}><App /><History /></MemoryRouter>)
    fireEvent.click(screen.getByRole('link', { name: 'Friends', exact: true }))
    await screen.findByRole('button', { name: 'Turn on downtime matching', exact: true })
    expect(hook).toHaveBeenCalled()
    expect(screen.getByLabelText('URL').textContent).toBe(`${path}?source=home`)
    fireEvent.click(screen.getByRole('button', { name: 'History back' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Dating in your downtime' })).toBeTruthy())
    expect(screen.getByLabelText('URL').textContent).toBe(`${path}?source=home&view=dating`)
  })
  it('downtime defaults unknown views to Friends', async () => {
    render(<MemoryRouter initialEntries={[`${path}?view=unknown`]}><App /></MemoryRouter>)
    await screen.findByRole('button', { name: 'Turn on downtime matching', exact: true })
    expect(screen.getByRole('link', { name: 'Friends', exact: true }).getAttribute('aria-current')).toBe('page')
  })
