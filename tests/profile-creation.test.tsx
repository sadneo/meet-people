import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './profile-feature-routes'
import type { AccountProfile } from '../shared/account-profile'
import type { MatchingProfile } from '../shared/matchmaking'

vi.mock('../src/supabase', () => ({ supabase: null }))
const auth = vi.hoisted(() => ({ ready: true, session: { access_token: 'first-fixture', user: { id: 'first-fixture' } } }))
vi.mock('../src/auth/useSession', () => ({ useSession: () => auth }))
const identity: AccountProfile = { username: 'chosen-name', display_name: 'Chosen name', bio: 'Chosen bio', avatar_url: null }
let account: AccountProfile | null, profile: MatchingProfile | null
let unavailable: boolean, saveFails: boolean, readbackFails: boolean, holdSave: Promise<void> | null
let sharedReadbackFails: boolean
const calls: { path: string; method: string; body: unknown }[] = []
beforeEach(() => {
  auth.session = { access_token: 'first-fixture', user: { id: 'first-fixture' } }
  account = null; profile = null; unavailable = false; saveFails = false; readbackFails = false; holdSave = null; calls.length = 0
  sharedReadbackFails = false
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  vi.stubGlobal('scrollTo', () => {})
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input), method = init?.method ?? 'GET', body = init?.body ? JSON.parse(String(init.body)) : null
    calls.push({ path, method, body })
    if (path.endsWith('/notifications')) return Response.json({ notifications: [], unreadCount: 0 })
    if (path.endsWith('/account-profile')) {
      if (unavailable) return Response.json({ code: 'unavailable', error: 'Identity unavailable.' }, { status: 503 })
      if (method === 'PUT') {
        if (holdSave) await holdSave
        if (saveFails) return Response.json({ code: 'provider', error: 'Identity save failed.' }, { status: 503 })
        account = body
      } else if (readbackFails && calls.some(call => call.method === 'PUT')) return Response.json({ code: 'unavailable', error: 'Readback unavailable.' }, { status: 503 })
      return Response.json({ profile: account })
    }
    if (path.endsWith('/profile')) {
      if (method === 'PUT') profile = body
      if (method === 'GET' && sharedReadbackFails && calls.some(call => call.path.endsWith('/profile') && call.method === 'PUT')) return Response.json({ code: 'unavailable', error: 'Shared readback unavailable.' }, { status: 503 })
      return Response.json({ profile })
    }
    return Response.json({ mode: null })
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })
const mount = () => render(<MemoryRouter initialEntries={['/profile']}><App /></MemoryRouter>)
const button = (name: string) => screen.getByRole('button', { name, exact: true }) as HTMLButtonElement
const writes = () => calls.filter(call => call.method !== 'GET')
async function edit() { await waitFor(() => expect(button('Edit profile').disabled).toBe(false)); fireEvent.click(button('Edit profile')) }
function enterIdentity() {
  fireEvent.change(screen.getByLabelText('Username', { exact: true }), { target: { value: identity.username } })
  fireEvent.change(screen.getByLabelText('Display name', { exact: true }), { target: { value: identity.display_name } })
  fireEvent.change(screen.getByLabelText('Bio', { exact: true }), { target: { value: identity.bio } })
}

it('successful null allows explicit first identity, GET readback, then first shared preferences on Profile without queue actions', async () => {
  mount(); await edit()
  expect(screen.getByLabelText('Username', { exact: true })).toHaveProperty('value', '')
  expect(screen.getByLabelText('Display name', { exact: true })).toHaveProperty('value', '')
  expect(writes()).toEqual([])
  enterIdentity(); fireEvent.click(button('Create identity'))
  await screen.findByRole('button', { name: 'Save shared preferences', exact: true })
  await waitFor(() => expect(button('Save shared preferences').disabled).toBe(false))
  expect(writes()).toEqual([{ path: '/api/matchmaking/account-profile', method: 'PUT', body: identity }])
  expect(calls.filter(call => call.path.endsWith('/account-profile')).at(-1)?.method).toBe('GET')
  fireEvent.click(button('Music')); fireEvent.click(button('Sunday late, not available'))
  fireEvent.click(button('Coffee')); fireEvent.click(button('Art'))
  fireEvent.change(screen.getByLabelText('City or campus area'), { target: { value: 'Chosen campus' } })
  fireEvent.change(screen.getByLabelText('Birthdate'), { target: { value: '2001-02-03' } })
  fireEvent.click(button('Save shared preferences'))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(writes()[1]).toEqual({ path: '/api/matchmaking/profile', method: 'PUT', body: { ...identity, birthdate: '2001-02-03', location_city: 'Chosen campus', interests: ['Music', 'Coffee', 'Art'], availability: [{ dow: 0, start_time: '21:00:00', end_time: '24:00:00' }] } })
  expect(calls.at(-1)).toMatchObject({ path: '/api/matchmaking/profile', method: 'GET' })
  fireEvent.click(screen.getAllByRole('link', { name: 'Matchmaking', exact: true })[0])
  fireEvent.click(await screen.findByRole('button', { name: 'Preferences', exact: true }))
  expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Music', exact: true }).getAttribute('aria-pressed')).toBe('true')
  expect(calls.some(call => /\/(queue|result)$/.test(call.path))).toBe(false)
})

it('read failure is not canonical null: creation disabled, retry reads only and never fabricates identity', async () => {
  unavailable = true; mount(); await edit()
  expect(button('Create identity').disabled).toBe(true)
  fireEvent.submit(screen.getByRole('form', { name: 'Profile identity' }))
  expect(writes()).toEqual([])
  unavailable = false
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reload shared profile', exact: true }))
  await waitFor(() => expect((screen.getByLabelText('Username') as HTMLInputElement).disabled).toBe(false))
  expect(screen.getByLabelText('Username')).toHaveProperty('value', '')
  expect(writes()).toEqual([])
})

it('existing identity with null shared profile can create preferences and retains the fresh authoritative username', async () => {
  account = { ...identity }; mount(); await edit()
  expect(screen.queryByLabelText('Username')).toBeNull()
  await waitFor(() => expect(button('Save shared preferences').disabled).toBe(false))
  fireEvent.click(button('Coffee'))
  fireEvent.click(button('Music')); fireEvent.click(button('Art'))
  fireEvent.change(screen.getByLabelText('Birthdate'), { target: { value: '2001-02-03' } })
  fireEvent.change(screen.getByLabelText('City or campus area'), { target: { value: 'Chosen campus' } })
  fireEvent.click(button('Sunday late, not available'))
  account = { ...identity, username: 'fresh-authoritative-name' }
  fireEvent.click(button('Save shared preferences'))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(profile).toMatchObject({ username: 'fresh-authoritative-name', interests: ['Coffee', 'Music', 'Art'] })
  expect(writes()).toHaveLength(1)
})

it('duplicate submit is guarded and failed creation preserves explicit drafts for a deliberate retry', async () => {
  let finish!: () => void
  holdSave = new Promise(resolve => { finish = resolve }); saveFails = true
  mount(); await edit(); enterIdentity()
  const form = screen.getByRole('form', { name: 'Profile identity' })
  fireEvent.submit(form); fireEvent.submit(form)
  await waitFor(() => expect(writes()).toHaveLength(1))
  await act(async () => { finish(); await holdSave })
  expect(screen.getByLabelText('Username')).toHaveProperty('value', identity.username)
  expect(screen.getByLabelText('Display name')).toHaveProperty('value', identity.display_name)
  expect(screen.getByRole('dialog').textContent).toContain('Identity save failed.')
  saveFails = false
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reload shared profile', exact: true }))
  await waitFor(() => expect(button('Create identity').disabled).toBe(false))
  fireEvent.click(button('Create identity'))
  await waitFor(() => expect(button('Save shared preferences').disabled).toBe(false))
  expect(writes()).toHaveLength(2)
})

it('accepted creation with failed readback does not unlock preferences or claim completion', async () => {
  mount(); await edit(); enterIdentity(); readbackFails = true
  fireEvent.click(button('Create identity'))
  await within(screen.getByRole('dialog')).findByText(/authoritative readback is unavailable/)
  expect(screen.queryByRole('button', { name: 'Save shared preferences', exact: true })).toBeNull()
  expect(screen.getByLabelText('Username')).toHaveProperty('value', identity.username)
  expect(writes()).toHaveLength(1)
})

it('pending creation cannot leak the old draft or perform follow-on reads after switching sessions', async () => {
  let finish!: () => void
  holdSave = new Promise(resolve => { finish = resolve })
  const view = mount(); await edit(); enterIdentity(); fireEvent.click(button('Create identity'))
  await waitFor(() => expect(writes()).toHaveLength(1))
  auth.session = { access_token: 'second-fixture', user: { id: 'second-fixture' } }
  view.rerender(<MemoryRouter initialEntries={['/profile']}><App /></MemoryRouter>)
  await waitFor(() => expect(screen.getByLabelText('Username')).toHaveProperty('value', ''))
  const before = calls.length
  await act(async () => { finish(); await holdSave })
  expect(calls).toHaveLength(before)
  expect(screen.getByLabelText('Username')).toHaveProperty('value', '')
})

it('invalid explicit identity fields never reach the save endpoint', async () => {
  mount(); await edit(); enterIdentity()
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: '   ' } })
  fireEvent.submit(screen.getByRole('form', { name: 'Profile identity' }))
  expect(within(screen.getByRole('dialog')).getByRole('alert').textContent).toContain('username of 1–80')
  expect(writes()).toEqual([])
})

it('creation does not overwrite an identity discovered by its fresh preflight read', async () => {
  mount(); await edit(); enterIdentity()
  account = { ...identity, username: 'created-elsewhere' }
  fireEvent.click(button('Create identity'))
  await within(screen.getByRole('dialog')).findByText(/An account identity now exists/)
  expect(writes()).toEqual([])
  expect(account.username).toBe('created-elsewhere')
  expect(screen.getByLabelText('Username')).toHaveProperty('value', identity.username)
})

it('existing identity edits preserve freshly read username and avatar instead of accepting draft username changes', async () => {
  account = { ...identity }; mount(); await edit()
  account = { ...identity, username: 'fresh-name', avatar_url: 'https://example.test/fixture.png' }
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Edited name' } })
  fireEvent.click(button('Save identity'))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(writes()[0].body).toEqual({ ...account, display_name: 'Edited name' })
})

it('first shared preferences retain drafts when accepted save readback fails, including a read-only reload retry', async () => {
  account = { ...identity }; mount(); await edit()
  await waitFor(() => expect(button('Save shared preferences').disabled).toBe(false))
  fireEvent.click(button('Music')); sharedReadbackFails = true
  fireEvent.click(button('Coffee')); fireEvent.click(button('Art'))
  fireEvent.change(screen.getByLabelText('Birthdate'), { target: { value: '2001-02-03' } })
  fireEvent.click(button('Sunday late, not available'))
  fireEvent.change(screen.getByLabelText('City or campus area'), { target: { value: 'Kept draft area' } })
  fireEvent.click(button('Save shared preferences'))
  await within(screen.getByRole('dialog')).findByText(/authoritative readback is unavailable/)
  expect(button('Music').getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByLabelText('City or campus area')).toHaveProperty('value', 'Kept draft area')
  expect(button('Save shared preferences').disabled).toBe(true)
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reload shared profile', exact: true }))
  await within(screen.getByRole('dialog')).findByText('Shared readback unavailable.')
  expect(button('Music').getAttribute('aria-pressed')).toBe('true')
  expect(writes()).toHaveLength(1)
})
