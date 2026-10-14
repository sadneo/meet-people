import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from '../src/App'

vi.mock('../src/supabase', () => ({ supabase: null }))
const auth = vi.hoisted(() => ({ session: { access_token: 'test-jwt', user: { id: 'a0000000-0000-4000-8000-000000000001' } } as { access_token: string; user: { id: string } } | null }))
vi.mock('../src/auth/useSession', () => ({ useSession: () => ({ ready: true, session: auth.session }) }))
const account = { username: 'sam', display_name: 'Sam', bio: null, avatar_url: null }
const legacy = { ...account, birthdate: null, location_city: null, interests: ['Coffee'], availability: [] }
let available = true, missing = false, saveFails = false
let accountRead: Promise<Response> | null = null
const writes: { path: string; body: unknown }[] = []
beforeEach(() => {
  available = true; missing = false; saveFails = false; accountRead = null; writes.length = 0
  auth.session = { access_token: 'test-jwt', user: { id: 'a0000000-0000-4000-8000-000000000001' } }
  vi.stubGlobal('scrollTo', () => {})
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)
    if (init?.method === 'PUT') writes.push({ path, body: JSON.parse(String(init.body)) })
    if (path.endsWith('/account-profile')) {
      if (init?.method !== 'PUT' && accountRead) return accountRead
      if (!available || (init?.method === 'PUT' && saveFails)) return Response.json({ code: 'unavailable', error: 'Account profile unavailable. No changes were saved.' }, { status: 503 })
      return Response.json({ profile: init?.method === 'PUT' ? JSON.parse(String(init.body)) : missing ? null : account })
    }
    if (path.endsWith('/profile')) return Response.json({ profile: init?.method === 'PUT' ? JSON.parse(String(init.body)) : legacy })
    if (path.endsWith('/notifications')) return Response.json({ notifications: [], unreadCount: 0 })
    return Response.json({ mode: null })
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })
const mount = (path = '/profile/account') => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
it('account UI loads authenticated canonical identity and saves no matching fields', async () => {
  mount()
  const name = await screen.findByLabelText('Display name')
  expect((name as HTMLInputElement).value).toBe('Sam')
  expect(screen.queryByText('Weekly availability')).toBeNull()
  fireEvent.change(name, { target: { value: 'New Sam' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save account profile' }))
  await screen.findByText('Account profile saved.')
  expect(writes).toEqual([{ path: '/api/matchmaking/account-profile', body: { ...account, display_name: 'New Sam' } }])
})
it('account UI unavailable never invents identity or claims a successful save', async () => {
  available = false; mount()
  await screen.findByText(/Account profile unavailable/)
  expect(screen.queryByLabelText('Display name')).toBeNull()
  expect(writes).toHaveLength(0)
  expect(screen.queryByText('Account profile saved.')).toBeNull()
})
it('account UI creates blank identity only with supported backend and retains draft on failed save', async () => {
  missing = true; mount()
  expect((await screen.findByLabelText('Username') as HTMLInputElement).value).toBe('')
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'real-sam' } })
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Real Sam' } })
  saveFails = true
  fireEvent.click(screen.getByRole('button', { name: 'Save account profile' }))
  await screen.findByRole('alert')
  expect((screen.getByLabelText('Display name') as HTMLInputElement).value).toBe('Real Sam')
  expect(screen.queryByText('Account profile saved.')).toBeNull()
})
it('account UI signed out does not request or fabricate an account', () => {
  auth.session = null; mount()
  expect(screen.getByRole('heading', { name: 'Sign in to manage your account profile' })).toBeTruthy()
  expect(screen.queryByLabelText('Username')).toBeNull()
  expect(fetch).not.toHaveBeenCalled()
})
it('account UI is reachable from forest Profile and Settings', () => {
  const view = mount('/profile')
  expect(screen.getByRole('link', { name: 'Account profile', exact: true }).getAttribute('href')).toBe('/profile/account')
  view.unmount(); mount('/settings')
  expect(screen.getByRole('link', { name: 'Account profile', exact: true }).getAttribute('href')).toBe('/profile/account')
})
it('separated preferences use canonical identity through the full legacy adapter without duplicated editable fields', async () => {
  mount('/matchmaking')
  fireEvent.click(await screen.findByRole('button', { name: 'Preferences' }))
  await screen.findByText('Identity comes from your account profile.')
  for (const label of ['Username', 'Display name', 'Bio', 'Avatar URL (HTTPS, optional)']) expect(screen.queryByLabelText(label)).toBeNull()
  expect(screen.getByRole('link', { name: 'Account profile', exact: true })).toBeTruthy()
  fireEvent.change(screen.getByLabelText('City or campus area'), { target: { value: 'Campus' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(writes).toEqual([{ path: '/api/matchmaking/profile', body: { ...legacy, location_city: 'Campus' } }])
})
it('separated preferences require a canonical account when supported and never submit invalid legacy data', async () => {
  missing = true; mount('/matchmaking')
  fireEvent.click(await screen.findByRole('button', { name: 'Preferences' }))
  await screen.findByText('Save an account profile before matching preferences.')
  expect((screen.getByRole('button', { name: 'Save preferences' }) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.queryByLabelText('Username')).toBeNull()
  expect(writes).toHaveLength(0)
})
it('compatibility preferences preserve the real Friends legacy save contract when account RPCs are absent', async () => {
  available = false; mount('/matchmaking')
  fireEvent.click(await screen.findByRole('button', { name: 'Preferences' }))
  await screen.findByText(/Account profile separation unavailable/)
  expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe('sam')
  fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(writes).toEqual([{ path: '/api/matchmaking/profile', body: legacy }])
})
it('separated preferences cannot save while account compatibility is still loading', async () => {
  let finish!: (response: Response) => void
  accountRead = new Promise(resolve => { finish = resolve })
  mount('/matchmaking')
  fireEvent.click(await screen.findByRole('button', { name: 'Preferences' }))
  expect((screen.getByRole('button', { name: 'Save preferences' }) as HTMLButtonElement).disabled).toBe(true)
  await act(async () => { finish(Response.json({ profile: account })); await accountRead })
  expect((screen.getByRole('button', { name: 'Save preferences' }) as HTMLButtonElement).disabled).toBe(false)
})
