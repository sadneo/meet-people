import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from '../src/App'
import type { AccountProfile } from '../shared/account-profile'
import type { MatchingProfile } from '../shared/matchmaking'

const auth = vi.hoisted(() => ({ ready: true, session: { access_token: 'fixture-first', user: { id: 'fixture-first' } } }))
vi.mock('../src/auth/useSession', () => ({ useSession: () => auth }))
vi.mock('../src/supabase', () => ({ supabase: null }))
vi.mock('../src/features/prototype/Home', () => ({ Home: () => <h1>Ready app fixture</h1> }))
const identity: AccountProfile = { username: 'chosen-fixture', display_name: 'Chosen fixture', bio: null, avatar_url: null }
const complete: MatchingProfile = { ...identity, interests: ['Music', 'Coffee', 'Art'], birthdate: '2001-02-03', location_city: 'Chosen campus', availability: [{ dow: 0, start_time: '21:00:00', end_time: '24:00:00' }] }
let account: AccountProfile | null, profile: MatchingProfile | null
let readFails: boolean, saveFails: boolean, readbackFails: boolean, holdSave: Promise<void> | null
const calls: { path: string; method: string; body: unknown }[] = []
const dialogDescriptors = Object.fromEntries(['showModal', 'close'].map(name => [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)]))
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, writable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, writable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open') } })
  auth.session = { access_token: 'fixture-first', user: { id: 'fixture-first' } }
  account = null; profile = null; readFails = false; saveFails = false; readbackFails = false; holdSave = null; calls.length = 0
  vi.stubGlobal('scrollTo', () => {})
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input), method = init?.method ?? 'GET', body = init?.body ? JSON.parse(String(init.body)) : null
    calls.push({ path, method, body })
    if (path.endsWith('/notifications')) return Response.json({ notifications: [], unreadCount: 0 })
    if (method === 'GET' && readFails) return Response.json({ code: 'unavailable', error: 'Profile reads unavailable.' }, { status: 503 })
    if (path.endsWith('/account-profile')) { if (method === 'PUT') account = body; return Response.json({ profile: account }) }
    if (path.endsWith('/profile')) {
      if (method === 'PUT') { if (holdSave) await holdSave; if (saveFails) return Response.json({ code: 'provider', error: 'Preferences save unavailable.' }, { status: 503 }); profile = body }
      if (method === 'GET' && readbackFails && calls.some(call => call.path.endsWith('/profile') && call.method === 'PUT')) return Response.json({ code: 'unavailable', error: 'Readback unavailable.' }, { status: 503 })
      return Response.json({ profile })
    }
    return Response.json({ mode: null })
  }))
})
afterEach(() => {
  cleanup()
  for (const [name, descriptor] of Object.entries(dialogDescriptors)) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor)
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name)
  }
  vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear()
})
function Path() { const location = useLocation(); return <output aria-label="Onboarding URL">{location.pathname}{location.search}{location.hash}</output> }
const mount = (path = '/?from=registration#anchor') => render(<MemoryRouter initialEntries={[path]}><App /><Path /></MemoryRouter>)
const button = (name: string) => screen.getByRole('button', { name, exact: true }) as HTMLButtonElement
async function identityStep() {
  await screen.findByRole('heading', { name: 'Complete onboarding', exact: true })
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: identity.username } })
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: identity.display_name } })
  fireEvent.click(button('Save identity and continue'))
  await waitFor(() => expect(button('Finish onboarding').disabled).toBe(false))
}
function preferences() {
  for (const label of complete.interests) fireEvent.click(button(label))
  fireEvent.change(screen.getByLabelText('City or campus area'), { target: { value: complete.location_city } })
  fireEvent.change(screen.getByLabelText('Birthdate'), { target: { value: complete.birthdate } })
  fireEvent.click(button('Sunday late, not available'))
}

it('new users must explicitly persist identity and all required preferences before original-destination access', async () => {
  mount(); await identityStep()
  expect(screen.queryByRole('heading', { name: 'Ready app fixture' })).toBeNull()
  expect(account).toEqual(identity); expect(profile).toBeNull()
  expect(screen.getByLabelText('Onboarding URL').textContent).toBe(`/onboarding?${new URLSearchParams({ returnTo: '/?from=registration#anchor' })}`)
  preferences(); fireEvent.click(button('Finish onboarding'))
  await screen.findByRole('heading', { name: 'Ready app fixture', exact: true })
  expect(profile).toEqual(complete)
  expect(screen.getByLabelText('Onboarding URL').textContent).toBe('/?from=registration#anchor')
  expect(calls.filter(call => call.method === 'PUT').map(call => call.path)).toEqual(['/api/matchmaking/account-profile', '/api/matchmaking/profile'])
  expect(calls.some(call => /\/(queue|result)$/.test(call.path))).toBe(false)
})

it('partial older profiles resume with saved selections and cannot finish with fewer than three interests or missing required fields', async () => {
  account = identity; profile = { ...complete, interests: ['Coffee'], birthdate: null, availability: [] }
  mount(); await screen.findByRole('heading', { name: 'Complete onboarding', exact: true })
  await waitFor(() => expect(button('Finish onboarding').disabled).toBe(false))
  expect(button('Coffee').getAttribute('aria-pressed')).toBe('true')
  fireEvent.submit(button('Finish onboarding').closest('form')!)
  expect(screen.getByRole('alert').textContent).toContain('three')
  expect(calls.some(call => call.method !== 'GET')).toBe(false)
})

it('complete users never revisit onboarding on login/refresh; legacy completion URL returns to the validated destination', async () => {
  account = identity; profile = complete
  mount('/complete-profile?returnTo=%2F%3Ffrom%3Dlegacy')
  await screen.findByRole('heading', { name: 'Ready app fixture', exact: true })
  expect(screen.queryByLabelText('Username')).toBeNull()
  expect(screen.getByLabelText('Onboarding URL').textContent).toBe('/?from=legacy')
  expect(calls.every(call => call.method === 'GET')).toBe(true)
})

it('read failure blocks and retries without signup misclassification or writes', async () => {
  readFails = true; mount(); await screen.findByRole('heading', { name: 'Profile unavailable', exact: true })
  expect(screen.queryByLabelText('Username')).toBeNull()
  readFails = false; fireEvent.click(button('Retry profile'))
  await screen.findByRole('heading', { name: 'Complete onboarding', exact: true })
  expect(calls.every(call => call.method === 'GET')).toBe(true)
})

it('identity-only interruption and failed preferences retain drafts, never resubmit identity or enroll a queue', async () => {
  account = identity; saveFails = true
  const view = mount('/onboarding?returnTo=%2F'); await screen.findByRole('heading', { name: 'Complete onboarding', exact: true })
  await waitFor(() => expect(button('Finish onboarding').disabled).toBe(false))
  preferences(); fireEvent.click(button('Finish onboarding'))
  await screen.findByText('Preferences save unavailable.')
  expect(button('Music').getAttribute('aria-pressed')).toBe('true')
  expect(calls.filter(call => call.method === 'PUT')).toHaveLength(1)
  view.unmount(); saveFails = false
  mount('/onboarding?returnTo=%2F'); await screen.findByRole('heading', { name: 'Complete onboarding', exact: true })
  expect(screen.queryByLabelText('Username')).toBeNull()
  expect(calls.some(call => call.path.endsWith('/account-profile') && call.method === 'PUT')).toBe(false)
})

it('duplicate/uncertain preferences saves reconcile by read-only retry, keeping app blocked until confirmed readiness', async () => {
  account = identity; readbackFails = true
  let finish!: () => void
  holdSave = new Promise(resolve => { finish = resolve })
  mount('/onboarding?returnTo=%2F'); await screen.findByRole('heading', { name: 'Complete onboarding', exact: true })
  await waitFor(() => expect(button('Finish onboarding').disabled).toBe(false))
  preferences(); const form = button('Finish onboarding').closest('form')!
  fireEvent.submit(form); fireEvent.submit(form)
  await waitFor(() => expect(calls.filter(call => call.method === 'PUT')).toHaveLength(1))
  await act(async () => { finish(); await holdSave })
  await screen.findByText(/authoritative readback is unavailable/)
  expect(screen.queryByRole('heading', { name: 'Ready app fixture' })).toBeNull()
  expect(button('Music').getAttribute('aria-pressed')).toBe('true')
  readbackFails = false; fireEvent.click(button('Retry profile'))
  await screen.findByRole('heading', { name: 'Ready app fixture', exact: true })
  expect(calls.filter(call => call.method === 'PUT')).toHaveLength(1)
})

it('another tab identity is never overwritten and interrupted onboarding resumes its authoritative identity', async () => {
  mount(); await screen.findByRole('heading', { name: 'Complete onboarding', exact: true })
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'unsaved-draft' } })
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Unsaved draft' } })
  account = { ...identity, username: 'other-tab-identity', display_name: 'Other tab identity' }
  fireEvent.click(button('Save identity and continue'))
  await screen.findByText(/An account identity now exists/)
  expect(calls.some(call => call.method === 'PUT')).toBe(false)
  expect(screen.getByLabelText('Username')).toHaveProperty('value', 'unsaved-draft')
  fireEvent.click(button('Retry profile'))
  await screen.findByText('Other tab identity', { exact: true })
  expect(screen.queryByLabelText('Username')).toBeNull()
  expect(screen.queryByRole('heading', { name: 'Ready app fixture' })).toBeNull()
})

it('owner/token swap during preference save fences late callbacks and keeps the new owner on blank onboarding', async () => {
  account = identity
  let finish!: () => void
  holdSave = new Promise(resolve => { finish = resolve })
  const originalFetch = vi.mocked(fetch).getMockImplementation()!
  vi.mocked(fetch).mockImplementation(async (input, init) => new Headers(init?.headers).get('Authorization') === 'Bearer second-owner' ? Response.json({ profile: null }) : originalFetch(input, init))
  const view = mount(); await screen.findByRole('heading', { name: 'Complete onboarding', exact: true })
  await waitFor(() => expect(button('Finish onboarding').disabled).toBe(false))
  preferences(); fireEvent.click(button('Finish onboarding'))
  await waitFor(() => expect(calls.filter(call => call.method === 'PUT')).toHaveLength(1))
  auth.session = { access_token: 'second-owner', user: { id: 'second-owner' } }
  view.rerender(<MemoryRouter initialEntries={['/']}><App /><Path /></MemoryRouter>)
  await waitFor(() => expect(screen.getByLabelText('Username')).toHaveProperty('value', ''))
  const before = calls.length
  await act(async () => { finish(); await holdSave })
  expect(calls).toHaveLength(before)
  expect(screen.queryByRole('heading', { name: 'Ready app fixture' })).toBeNull()
  expect(screen.getByLabelText('Username')).toHaveProperty('value', '')
})

it('ordinary Profile editing cannot clear readiness once onboarding is complete', async () => {
  account = identity; profile = complete
  mount('/profile')
  const edit = await screen.findByRole('button', { name: 'Edit profile', exact: true })
  await waitFor(() => expect((edit as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(edit)
  await waitFor(() => expect(button('Save shared preferences').disabled).toBe(false))
  fireEvent.click(button('Coffee'))
  fireEvent.submit(button('Save shared preferences').closest('form')!)
  expect(screen.getByRole('alert').textContent).toContain('three')
  expect(calls.some(call => call.method === 'PUT')).toBe(false)
  expect(profile.interests).toEqual(complete.interests)
})
