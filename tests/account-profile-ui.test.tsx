import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate, useNavigationType } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from '../src/App'
import { requiredPreferences, accountFixture } from './complete-profile-fixture'

vi.mock('../src/supabase', () => ({ supabase: null }))
const auth = vi.hoisted(() => ({ session: { access_token: 'test-jwt', user: { id: 'a0000000-0000-4000-8000-000000000001' } } as { access_token: string; user: { id: string } } | null }))
vi.mock('../src/auth/useSession', () => ({ useSession: () => ({ ready: true, session: auth.session }) }))
const account = { username: 'canonical-sam', display_name: 'Canonical Sam', bio: 'Account bio', avatar_url: null }
const legacy = { username: 'legacy-sam', display_name: 'Legacy Sam', bio: 'Legacy bio', avatar_url: null, ...requiredPreferences, interests: ['Board games\nstrategy', 'Coffee', 'Art'] }
let available = true, missingAccount = false, missingLegacy = false
let accountRead: Promise<Response> | null = null
let profileSave: Promise<Response> | null = null
const writes: { path: string; body: unknown }[] = []
const reads: string[] = []
beforeEach(() => {
  available = true; missingAccount = false; missingLegacy = false; accountRead = null; profileSave = null; writes.length = 0; reads.length = 0
  auth.session = { access_token: 'test-jwt', user: { id: 'a0000000-0000-4000-8000-000000000001' } }
  vi.stubGlobal('scrollTo', () => {})
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)
    if (init?.method === 'PUT' || init?.method === 'POST') writes.push({ path, body: JSON.parse(String(init.body)) })
    else reads.push(path)
    if (path.endsWith('/account')) return available ? Response.json(accountFixture(missingAccount ? null : missingLegacy ? { ...account, interests: [], availability: [], birthdate: null, location_city: null } : { ...legacy, ...account })) : Response.json({ code: 'unavailable', error: 'Account unavailable.' }, { status: 503 })
    if (path.endsWith('/account-profile')) {
      if (accountRead) return (await accountRead).clone()
      if (!available) return Response.json({ code: 'unavailable', error: 'Account profile unavailable.' }, { status: 503 })
      return Response.json({ profile: missingAccount ? null : account })
    }
    if (path.endsWith('/profile')) return init?.method === 'PUT' && profileSave ? profileSave : Response.json({ profile: init?.method === 'PUT' ? JSON.parse(String(init.body)) : missingLegacy ? null : legacy })
    if (path.endsWith('/notifications')) return Response.json({ notifications: [], unreadCount: 0 })
    if (path.endsWith('/queue') && init?.method === 'POST') return Response.json({ mode: 'active' })
    return Response.json({ mode: null })
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })
const mount = (path = '/profile') => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
const save = () => screen.getByRole('button', { name: 'Save preferences' }) as HTMLButtonElement
async function preferences() {
  fireEvent.click(await screen.findByRole('button', { name: 'Preferences' }))
  await waitFor(() => expect(screen.queryByText('Checking saved identity…')).toBeNull())
}
function History() {
  const location = useLocation(), type = useNavigationType(), navigate = useNavigate()
  return <><output aria-label="Route">{location.pathname} {type}</output><button onClick={() => navigate(-1)}>History back</button></>
}

it('old account route replaces history with the shared Profile without automatic writes', async () => {
  render(<MemoryRouter initialEntries={['/settings', '/profile/account']} initialIndex={1}><App /><History /></MemoryRouter>)
  await waitFor(() => expect(screen.getByLabelText('Route').textContent).toBe('/profile REPLACE'))
  expect(screen.getByRole('button', { name: 'Edit profile', exact: true })).toBeTruthy()
  expect(screen.queryByRole('link', { name: 'Account profile', exact: true })).toBeNull()
  await screen.findByRole('heading', { name: account.display_name, exact: true })
  expect(reads.some(path => path.endsWith('/account-profile'))).toBe(true)
  expect(writes).toEqual([])
  expect(screen.queryByRole('button', { name: 'Save account profile' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'History back' }))
  await waitFor(() => expect(screen.getByLabelText('Route').textContent).toBe('/settings POP'))
})

it('Profile navigation reaches the canonical identity editor and writes identity only through account-profile', async () => {
  mount('/settings')
  await screen.findByRole('heading', { name: 'Settings', exact: true })
  expect(within(document.querySelector('.pt-settings')!).queryByRole('link', { name: 'Profile', exact: true })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Account menu' }))
  const row = within(screen.getByRole('navigation', { name: 'Account navigation' })).getByRole('link', { name: 'Profile', exact: true })
  expect(row.getAttribute('href')).toBe('/profile')
  fireEvent.click(row)
  await screen.findByRole('heading', { name: account.display_name, exact: true })
  fireEvent.click(screen.getByRole('button', { name: 'Edit profile', exact: true }))
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Session Alex' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save identity', exact: true }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(writes).toEqual([{ path: '/api/matchmaking/account-profile', body: { ...account, display_name: 'Session Alex' } }])
  expect(screen.queryByText('Account profile saved.')).toBeNull()
})

it('signed-out old account route redirects to login without account identity reads', async () => {
  auth.session = null; mount('/profile/account')
  await screen.findByRole('heading', { name: 'Sign in', exact: true })
  expect(screen.queryByLabelText('Username')).toBeNull()
  expect(reads).toEqual([])
})

for (const canonical of ['available', 'missing', 'unavailable']) {
  it(`shared preferences preserve interests and require canonical identity when canonical is ${canonical}`, async () => {
    available = canonical !== 'unavailable'; missingAccount = canonical === 'missing'
    mount('/matchmaking')
    if (canonical !== 'available') {
      await screen.findByRole('heading', { name: canonical === 'missing' ? 'Complete onboarding' : 'Profile unavailable', exact: true })
      expect(screen.queryByRole('button', { name: 'Preferences', exact: true })).toBeNull()
      expect(writes).toEqual([])
      expect(reads.some(path => /\/(queue|result)$/.test(path))).toBe(false)
      return
    }
    await preferences()
    await screen.findByText(/Using your saved account identity/)
    for (const label of ['Username', 'Display name', 'Bio', 'Avatar URL (HTTPS, optional)']) expect(screen.queryByLabelText(label)).toBeNull()
    expect(within(screen.getByRole('dialog')).getByRole('link', { name: 'Profile', exact: true }).getAttribute('href')).toBe('/profile')
    expect(screen.queryByLabelText('City or campus area')).toBeNull()
    expect(screen.queryByLabelText('Birthdate (optional)')).toBeNull()
    fireEvent.click(save())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(writes).toEqual([{ path: '/api/matchmaking/profile', body: { ...legacy, ...account } }])
  })
}

it('uses authoritative canonical identity and requires real preferences onboarding when no matching profile exists', async () => {
  missingLegacy = true; mount('/matchmaking')
  await screen.findByRole('heading', { name: 'Complete onboarding', exact: true })
  await screen.findByRole('heading', { name: 'Interests', level: 2, exact: true })
  expect(screen.getByText(account.display_name, { exact: true })).toBeTruthy()
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Preferences', exact: true })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Cancel search', exact: true })).toBeNull()
  expect(writes).toEqual([])
  expect(screen.queryByRole('button', { name: 'Find Friends', exact: true })).toBeNull()
  expect(screen.queryByLabelText('City or campus area')).toBeNull()
  expect(screen.queryByLabelText('Username')).toBeNull()
  expect(screen.getByRole('button', { name: 'Save interests and continue', exact: true })).toBeTruthy()
  expect(reads.some(path => /\/(queue|result)$/.test(path))).toBe(false)
})

for (const canonical of ['missing', 'unavailable']) {
  it(`missing server identity blocks save when canonical is ${canonical}; session edits cannot supply it`, async () => {
    missingLegacy = true; missingAccount = true; available = canonical !== 'unavailable'
    mount('/profile')
    await screen.findByRole('heading', { name: canonical === 'missing' ? 'Complete onboarding' : 'Profile unavailable', exact: true })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Preferences', exact: true })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Find Friends', exact: true })).toBeNull()
    expect(writes).toEqual([])
    expect(reads.some(path => /\/(queue|result)$/.test(path))).toBe(false)
    expect(screen.queryByRole('button', { name: 'Cancel search', exact: true })).toBeNull()
    if (canonical === 'missing') expect(screen.getByLabelText('Username')).toHaveProperty('value', '')
    else expect(screen.queryByLabelText('Username')).toBeNull()
    expect(screen.queryByText('Account profile saved.')).toBeNull()
  })
}

it('cannot save while identity compatibility is loading', async () => {
  let finish!: (response: Response) => void
  accountRead = new Promise(resolve => { finish = resolve })
  mount('/matchmaking')
  await screen.findByText('Checking your profile…')
  expect(screen.queryByRole('button', { name: 'Preferences' })).toBeNull()
  expect(writes).toEqual([])
  await act(async () => { finish(Response.json({ profile: account })); await accountRead })
  await preferences()
  await waitFor(() => expect(save().disabled).toBe(false))
})

it('an unavailable canonical identity blocks shared and identity writes on Profile', async () => {
  available = false; mount('/profile')
  await screen.findByRole('heading', { name: 'Profile unavailable', exact: true })
  expect(screen.queryByRole('form')).toBeNull()
  expect(reads.every(path => path.endsWith('/account'))).toBe(true)
  expect(writes).toEqual([])
})
