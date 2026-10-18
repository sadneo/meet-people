import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from '../src/App'
import { useSharedUserProfile } from '../src/features/account/useSharedUserProfile'
import { accountFixture } from './complete-profile-fixture'

vi.mock('../src/supabase', () => ({ supabase: null }))
const auth = vi.hoisted(() => ({ ready: true, session: { access_token: 'shared-fixture', user: { id: 'shared-actor' } } }))
vi.mock('../src/auth/useSession', () => ({ useSession: () => auth }))
const identity = { username: 'canonical', display_name: 'Canonical name', bio: 'Canonical bio', avatar_url: null }
let account = { ...identity }
const original = { ...identity, display_name: 'Legacy name', bio: 'Legacy bio', interests: ['Coffee', 'Music', 'Books', 'Art', 'Games', 'Hiking'], availability: [{ dow: 2, start_time: '09:15:00', end_time: '11:45:00' }, { dow: 0, start_time: '21:00:00', end_time: '24:00:00' }], location_city: 'Campus', birthdate: '2000-01-01' }
let profile = structuredClone(original)
let identityUnavailable = false
let profileUnavailable = false
let readbackFails = false
const calls: { path: string; method: string; body: unknown }[] = []
beforeEach(() => {
  auth.session = { access_token: 'shared-fixture', user: { id: 'shared-actor' } }
  account = { ...identity }; profile = structuredClone(original); calls.length = 0; identityUnavailable = false; profileUnavailable = false; readbackFails = false
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  vi.stubGlobal('scrollTo', () => {})
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input), method = init?.method ?? 'GET', body = init?.body ? JSON.parse(String(init.body)) : null
    calls.push({ path, method, body })
    if (path.endsWith('/account')) return identityUnavailable || profileUnavailable ? Response.json({ code: 'unavailable', error: 'Shared account unavailable.' }, { status: 503 }) : Response.json(accountFixture({ ...profile, ...account }))
    if (path.endsWith('/account-profile')) {
      if (identityUnavailable) return Response.json({ code: 'unavailable', error: 'Identity unavailable.' }, { status: 503 })
      if (method === 'PUT') account = body
      return Response.json({ profile: account })
    }
    if (path.endsWith('/profile')) {
      if (profileUnavailable) return Response.json({ code: 'unavailable', error: 'Shared profile unavailable.' }, { status: 503 })
      if (method === 'PUT') profile = body
      if (method === 'GET' && readbackFails && calls.some(call => call.path.endsWith('/profile') && call.method === 'PUT')) return Response.json({ code: 'unavailable', error: 'Readback unavailable.' }, { status: 503 })
      return Response.json({ profile })
    }
    if (path.endsWith('/notifications')) return Response.json({ notifications: [], unreadCount: 0 })
    return Response.json({ mode: null })
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })
const mount = () => render(<MemoryRouter initialEntries={['/profile']}><App /></MemoryRouter>)
const button = (name: string) => screen.getByRole('button', { name, exact: true }) as HTMLButtonElement
async function edit() { const opener = await screen.findByRole('button', { name: 'Edit profile', exact: true }); await waitFor(() => expect((opener as HTMLButtonElement).disabled).toBe(false)); opener.focus(); fireEvent.click(opener); await waitFor(() => expect(screen.queryByText('Checking saved identity…')).toBeNull()) }

it('a held matching save restores focus to the current same-owner opener after authoritative account reload replaces the private tree', async () => {
  const originalFetch = vi.mocked(fetch).getMockImplementation()!
  let finish!: () => void
  const pending = new Promise<void>(resolve => { finish = resolve })
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    if (String(input).endsWith('/profile') && init?.method === 'PUT') await pending
    return originalFetch(input, init)
  })
  render(<MemoryRouter initialEntries={['/matchmaking']}><App /></MemoryRouter>)
  const oldOpener = await screen.findByRole('button', { name: 'Preferences', exact: true })
  oldOpener.focus(); fireEvent.click(oldOpener)
  const editor = within(screen.getByRole('dialog'))
  await waitFor(() => expect(screen.queryByText('Checking saved identity…')).toBeNull())
  fireEvent.click(editor.getByRole('button', { name: 'Coffee', exact: true }))
  fireEvent.click(editor.getByRole('button', { name: 'Save preferences', exact: true }))
  expect(screen.getByRole('dialog')).toBeTruthy()
  await act(async () => { finish(); await pending })
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Preferences', exact: true })))
  expect(oldOpener.isConnected).toBe(false)
  expect(calls.filter(call => call.method === 'PUT')).toHaveLength(1)
  expect(calls.filter(call => call.path.endsWith('/account'))).toHaveLength(2)
  expect(calls.some(call => /\/(queue|result)$/.test(call.path))).toBe(false)
})

it('Profile saves all shared fields using canonical identity, preserving more than five labels and exact custom windows', async () => {
  mount(); await edit()
  expect(screen.getByLabelText('Display name')).toHaveProperty('value', identity.display_name)
  expect(screen.getByRole('button', { name: 'Hiking', exact: true }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByRole('button', { name: 'Tuesday morning, custom times; edit exact windows' })).toHaveProperty('disabled', true)
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Unsubmitted identity draft' } })
  fireEvent.change(screen.getByLabelText('Bio'), { target: { value: 'Unsubmitted bio draft' } })
  fireEvent.change(screen.getByLabelText('City or campus area'), { target: { value: 'North campus' } })
  fireEvent.change(screen.getByLabelText('Birthdate'), { target: { value: '2001-02-03' } })
  fireEvent.click(button('Monday morning, not available'))
  fireEvent.click(button('Save shared preferences'))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(calls.filter(call => call.method === 'PUT')).toEqual([{ path: '/api/matchmaking/profile', method: 'PUT', body: { ...original, ...identity, location_city: 'North campus', birthdate: '2001-02-03', availability: [...original.availability, { dow: 1, start_time: '08:00:00', end_time: '12:00:00' }] } }])
  expect(calls.at(-1)).toMatchObject({ path: '/api/matchmaking/profile', method: 'GET' })
  expect(screen.getByRole('region', { name: 'Your profile' }).textContent).toContain('Canonical name')
  expect(calls.some(call => /\/(queue|result)$/.test(call.path))).toBe(false)
})

it('Profile identity saves use only account-profile, never matching profile writes', async () => {
  mount(); await edit()
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Updated name' } })
  fireEvent.change(screen.getByLabelText('Bio'), { target: { value: 'Updated bio' } })
  fireEvent.click(button('Save identity'))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(calls.filter(call => call.method === 'PUT')).toEqual([{ path: '/api/matchmaking/account-profile', method: 'PUT', body: { ...identity, display_name: 'Updated name', bio: 'Updated bio' } }])
  expect(calls.at(-1)).toMatchObject({ path: '/api/matchmaking/account-profile', method: 'GET' })
})

it('unavailable canonical identity disables shared writes even when a legacy matching profile exists', async () => {
  identityUnavailable = true
  mount(); await screen.findByRole('heading', { name: 'Profile unavailable', exact: true })
  expect(screen.queryByRole('button', { name: 'Save shared preferences', exact: true })).toBeNull()
  expect(calls.some(call => call.method === 'PUT')).toBe(false)
})

it('does not report completion or dismiss the editor when authoritative shared readback fails', async () => {
  mount(); await edit(); readbackFails = true
  fireEvent.change(screen.getByLabelText('City or campus area'), { target: { value: 'Unconfirmed area' } })
  fireEvent.click(button('Save shared preferences'))
  await within(screen.getByRole('dialog')).findByRole('alert')
  expect(screen.getByRole('dialog')).toBeTruthy()
})

it('an unavailable shared-profile API disables identity writes and never invents editable shared values', async () => {
  profileUnavailable = true
  mount(); await screen.findByRole('heading', { name: 'Profile unavailable', exact: true })
  expect(screen.queryByRole('button', { name: 'Save identity', exact: true })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Save shared preferences', exact: true })).toBeNull()
  expect(screen.getByRole('button', { name: 'Retry account', exact: true })).toBeTruthy()
  expect(calls.some(call => call.method === 'PUT')).toBe(false)
})

it('matching edits are read back on Profile without sharing identity edit controls', async () => {
  mount()
  await screen.findByText('Canonical name', { exact: true })
  fireEvent.click(screen.getAllByRole('link', { name: 'Matchmaking', exact: true })[0])
  fireEvent.click(await screen.findByRole('button', { name: 'Preferences', exact: true }))
  const editor = within(screen.getByRole('dialog'))
  await waitFor(() => expect(screen.queryByText('Checking saved identity…')).toBeNull())
  expect(editor.queryByLabelText('Display name')).toBeNull(); expect(editor.queryByLabelText('Bio')).toBeNull()
  expect(editor.queryByLabelText('City or campus area')).toBeNull()
  expect(editor.queryByLabelText('Birthdate (optional)')).toBeNull()
  fireEvent.click(editor.getByRole('button', { name: 'Coffee', exact: true }))
  fireEvent.click(editor.getByRole('button', { name: 'Save preferences', exact: true }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  fireEvent.click((await screen.findAllByRole('link', { name: 'Profile', exact: true }))[0])
  await edit()
  expect(screen.getByLabelText('City or campus area')).toHaveProperty('value', 'Campus')
  expect(screen.getByLabelText('Birthdate')).toHaveProperty('value', '2000-01-01')
  expect(screen.getByRole('button', { name: 'Hiking', exact: true }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByRole('button', { name: 'Coffee', exact: true }).getAttribute('aria-pressed')).toBe('false')
})

it('delayed route reads preselect authoritative interests instead of exposing empty setup while loading', async () => {
  const originalFetch = vi.mocked(fetch).getMockImplementation()!
  let finish!: () => void
  const pending = new Promise<void>(resolve => { finish = resolve })
  let delay = false
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    if (delay && String(input).endsWith('/profile')) await pending
    return originalFetch(input, init)
  })
  mount(); await edit()
  fireEvent.click(button('Music'))
  fireEvent.click(button('Sports'))
  fireEvent.click(button('Save shared preferences'))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  delay = true
  fireEvent.click(screen.getAllByRole('link', { name: 'Matchmaking', exact: true })[0])
  await screen.findByText('Loading profile…')
  expect(screen.queryByText('No matching profile saved yet.')).toBeNull()
  expect(screen.queryByText('0/30 selected')).toBeNull()
  await act(async () => { finish(); await pending })
  fireEvent.click(await screen.findByRole('button', { name: 'Preferences', exact: true }))
  expect(button('Sports').getAttribute('aria-pressed')).toBe('true')
  expect(button('Music').getAttribute('aria-pressed')).toBe('false')
  expect(button('Hiking').getAttribute('aria-pressed')).toBe('true')
  expect(calls.filter(call => call.method === 'PUT')).toHaveLength(1)
  expect(calls.some(call => /\/(queue|result)$/.test(call.path))).toBe(false)
})

it('a session change discards a pending prior actor read before hydrating the new Profile editor', async () => {
  const originalFetch = vi.mocked(fetch).getMockImplementation()!
  let finish!: () => void
  const pending = new Promise<void>(resolve => { finish = resolve })
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    if (String(input).endsWith('/account') && (init?.headers as Record<string, string>)?.Authorization === 'Bearer shared-fixture') {
      await pending
      return Response.json(accountFixture(original))
    }
    return originalFetch(input, init)
  })
  const view = mount()
  await screen.findByText('Checking your profile…')
  expect(screen.queryByRole('button', { name: 'Edit profile', exact: true })).toBeNull()
  profile = { ...profile, interests: ['Sports', 'coffee', 'Board games\nstrategy'] }
  auth.session = { access_token: 'second-fixture', user: { id: 'second-actor' } }
  view.rerender(<MemoryRouter initialEntries={['/profile']}><App /></MemoryRouter>)
  await edit()
  await act(async () => { finish(); await pending })
  expect(button('Sports').getAttribute('aria-pressed')).toBe('true')
  expect(button('coffee').getAttribute('aria-pressed')).toBe('true')
  expect(button('Coffee').getAttribute('aria-pressed')).toBe('false')
  expect(button('Board games\nstrategy').getAttribute('aria-pressed')).toBe('true')
  expect(button('Music').getAttribute('aria-pressed')).toBe('false')
  expect(calls.some(call => call.method !== 'GET')).toBe(false)
})

it('main Friends also discards a prior session profile read instead of selecting its interests', async () => {
  const originalFetch = vi.mocked(fetch).getMockImplementation()!
  let finish!: () => void
  const pending = new Promise<void>(resolve => { finish = resolve })
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    if (String(input).endsWith('/profile') && (init?.headers as Record<string, string>)?.Authorization === 'Bearer shared-fixture') {
      await pending
      return Response.json({ profile: original })
    }
    return originalFetch(input, init)
  })
  const view = render(<MemoryRouter initialEntries={['/matchmaking']}><App /></MemoryRouter>)
  await screen.findByText('Checking your profile…')
  profile = { ...profile, interests: ['Sports', 'Art', 'Coffee'] }
  auth.session = { access_token: 'second-fixture', user: { id: 'second-actor' } }
  view.rerender(<MemoryRouter initialEntries={['/matchmaking']}><App /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Preferences', exact: true }))
  await act(async () => { finish(); await pending })
  expect(button('Sports').getAttribute('aria-pressed')).toBe('true')
  expect(button('Music').getAttribute('aria-pressed')).toBe('false')
  expect(calls.some(call => call.method !== 'GET' || /\/(queue|result)$/.test(call.path))).toBe(false)
})

it('main Friends treats a failed shared read as unavailable, not a missing profile or prototype interests', async () => {
  profileUnavailable = true
  render(<MemoryRouter initialEntries={['/matchmaking']}><App /></MemoryRouter>)
  await screen.findByRole('heading', { name: 'Profile unavailable', exact: true })
  expect(screen.queryByText('No matching profile saved yet.')).toBeNull()
  expect(screen.queryByText('0/30 selected')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Coffee', exact: true })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Find Friends', exact: true })).toBeNull()
  expect(calls.some(call => call.method !== 'GET' || /\/(queue|result)$/.test(call.path))).toBe(false)
})

it('shared Profile reload immediately marks pending state and blocks writes while retaining last confirmed values', async () => {
  const { result } = renderHook(() => useSharedUserProfile('shared-fixture'))
  await waitFor(() => expect(result.current.canWrite).toBe(true))
  const originalFetch = vi.mocked(fetch).getMockImplementation()!
  let finish!: () => void
  const pending = new Promise<void>(resolve => { finish = resolve })
  vi.mocked(fetch).mockImplementation(async (input, init) => { if (String(input).endsWith('/profile')) await pending; return originalFetch(input, init) })
  act(() => result.current.reload())
  expect(result.current.loading).toBe(true)
  expect(result.current.canWrite).toBe(false)
  expect(result.current.profile?.interests).toEqual(original.interests)
  await act(async () => { await result.current.saveShared(original) })
  expect(calls.some(call => call.method !== 'GET')).toBe(false)
  await act(async () => { finish(); await pending })
  await waitFor(() => expect(result.current.loading).toBe(false))
})

it('an open Profile editor waits for a new session snapshot before initializing identity and shared selections', async () => {
  const view = mount(); await edit()
  const originalFetch = vi.mocked(fetch).getMockImplementation()!
  let finish!: () => void
  const pending = new Promise<void>(resolve => { finish = resolve })
  vi.mocked(fetch).mockImplementation(async (input, init) => { if (/\/(profile|account-profile)$/.test(String(input))) await pending; return originalFetch(input, init) })
  account = { ...identity, display_name: 'Second identity' }; profile = { ...profile, interests: ['Sports', 'Art', 'Coffee'] }
  auth.session = { access_token: 'second', user: { id: 'second' } }
  view.rerender(<MemoryRouter initialEntries={['/profile']}><App /></MemoryRouter>)
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.queryByLabelText('Display name')).toBeNull()
  await act(async () => { finish(); await pending })
  await edit()
  const editor = within(screen.getByRole('dialog'))
  await waitFor(() => expect(editor.getByLabelText('Display name')).toHaveProperty('value', 'Second identity'))
  expect(editor.getByRole('button', { name: 'Sports', exact: true }).getAttribute('aria-pressed')).toBe('true')
  expect(calls.some(call => call.method !== 'GET')).toBe(false)
})

it('a retained shared-save callback from an old session cannot issue requests for that actor', async () => {
  const { result, rerender } = renderHook(({ token }) => useSharedUserProfile(token), { initialProps: { token: 'old-fixture' } })
  await waitFor(() => expect(result.current.canWrite).toBe(true))
  const oldSave = result.current.saveShared
  rerender({ token: 'new-fixture' })
  await waitFor(() => expect(result.current.canWrite).toBe(true))
  const before = calls.length
  await act(async () => { expect(await oldSave(original)).toBe(false) })
  expect(calls).toHaveLength(before)
})

it('a retained identity-save callback cannot issue requests after unmount', async () => {
  const { result, unmount } = renderHook(() => useSharedUserProfile('fixture'))
  await waitFor(() => expect(result.current.canSaveIdentity).toBe(true))
  const oldSave = result.current.saveIdentity
  unmount()
  const before = calls.length
  expect(await oldSave({ display_name: 'Stale draft', bio: null })).toBe(false)
  expect(calls).toHaveLength(before)
})

it('a fresh preflight that finds identity missing blocks further writes until explicit read-only reload', async () => {
  const { result } = renderHook(() => useSharedUserProfile('fixture'))
  await waitFor(() => expect(result.current.canWrite).toBe(true))
  const originalFetch = vi.mocked(fetch).getMockImplementation()!
  vi.mocked(fetch).mockImplementation(async (input, init) => String(input).endsWith('/account-profile') ? Response.json({ profile: null }) : originalFetch(input, init))
  await act(async () => { expect(await result.current.saveShared(original)).toBe(false) })
  expect(result.current.canWrite).toBe(false)
  expect(result.current.canSaveIdentity).toBe(false)
  expect(result.current.profile?.interests).toEqual(original.interests)
  expect(calls.some(call => call.method !== 'GET')).toBe(false)
})
