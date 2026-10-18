import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from '../src/App'
import { completedAccountChapters, emptyAccount, type Account } from '../shared/account'
import { accountFixture } from './complete-profile-fixture'

const auth = vi.hoisted(() => ({ ready: true, session: { access_token: 'fixture-first', user: { id: 'fixture-first' } } }))
vi.mock('../src/auth/useSession', () => ({ useSession: () => auth }))
vi.mock('../src/supabase', () => ({ supabase: null }))
vi.mock('../src/features/prototype/Home', () => ({ Home: () => <h1>Ready app fixture</h1> }))
const identity = { username: 'chosen-fixture', display_name: 'Chosen fixture', bio: null, avatar_url: null }
const complete = { ...identity, interests: ['Music', 'Coffee', 'Art'], birthdate: '2001-02-03', location_city: 'Chosen campus', availability: [{ dow: 0, start_time: '21:00:00', end_time: '24:00:00' }] }
const partial = () => ({ ...identity, interests: [], availability: [], birthdate: null, location_city: null })
let stored: Account, readFails: boolean, saveFails: boolean, readbackFails: boolean, holdSave: Promise<void> | null
const calls: { path: string; method: string; body: unknown }[] = []
const descriptors = Object.fromEntries(['showModal', 'close'].map(name => [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)]))
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, writable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, writable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open') } })
  auth.session = { access_token: 'fixture-first', user: { id: 'fixture-first' } }
  stored = structuredClone(emptyAccount); readFails = false; saveFails = false; readbackFails = false; holdSave = null; calls.length = 0
  vi.stubGlobal('scrollTo', () => {})
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input), method = init?.method ?? 'GET', body = init?.body ? JSON.parse(String(init.body)) : null
    calls.push({ path, method, body })
    if (path.endsWith('/account')) {
      if (method === 'GET' && (readFails || (readbackFails && calls.some(call => call.method === 'PUT')))) return Response.json({ code: 'unavailable', error: 'Account read unavailable.' }, { status: 503 })
      if (method === 'PUT') {
        if (holdSave) await holdSave
        if (saveFails) return Response.json({ code: 'provider', error: 'Account save unavailable.' }, { status: 503 })
        stored = body
      }
      return Response.json(stored)
    }
    // Ordinary private editor compatibility reads, not onboarding defaults.
    if (path.endsWith('/account-profile')) return Response.json({ profile: stored.profile ? { username: stored.profile.username, display_name: stored.profile.display_name, bio: stored.profile.bio, avatar_url: stored.profile.avatar_url } : null })
    if (path.endsWith('/profile')) return Response.json({ profile: stored.profile })
    if (path.endsWith('/notifications')) return Response.json({ notifications: [], unreadCount: 0 })
    throw new Error(`Unexpected request ${method} ${path}`)
  }))
})
afterEach(() => {
  cleanup()
  for (const [name, descriptor] of Object.entries(descriptors)) {
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
  await screen.findByRole('button', { name: 'Save interests and continue', exact: true })
}
async function interestsStep() {
  for (const label of complete.interests) fireEvent.click(button(label))
  fireEvent.click(button('Save interests and continue'))
  await screen.findByRole('heading', { name: 'Social intent', exact: true })
}
async function socialStep() {
  fireEvent.click(button('Meet new people')); fireEvent.click(button('Save social intent and continue'))
  await screen.findByRole('button', { name: 'Finish onboarding', exact: true })
}
function preferences() {
  fireEvent.change(screen.getByLabelText('City or campus area'), { target: { value: complete.location_city } })
  fireEvent.change(screen.getByLabelText('Birthdate'), { target: { value: complete.birthdate } })
  fireEvent.change(screen.getByLabelText('Comfortable distance'), { target: { value: 'Nearby' } })
  fireEvent.change(screen.getByLabelText('Group preference'), { target: { value: 'Either' } })
  fireEvent.click(button('Sunday late, not available'))
}
function lastChapter() {
  stored = accountFixture({ ...complete, birthdate: null, location_city: null, availability: [] })
}

it('new users explicitly save all four chapters, read back readiness and return to the original path/query/hash without queues', async () => {
  mount(); await identityStep()
  expect(stored.profile).toEqual(partial()); expect(stored.completed).toEqual([0])
  expect(stored.preferences.distance).toBe(''); expect(stored.preferences.group).toBe('')
  expect(screen.queryByRole('heading', { name: 'Ready app fixture' })).toBeNull()
  expect(screen.getByLabelText('Onboarding URL').textContent).toBe(`/onboarding?${new URLSearchParams({ returnTo: '/?from=registration#anchor' })}`)
  await interestsStep(); await socialStep(); preferences(); fireEvent.click(button('Finish onboarding'))
  await screen.findByRole('heading', { name: 'Ready app fixture', exact: true })
  expect(stored.profile).toEqual(complete); expect(stored.completed).toEqual([0, 1, 2, 3])
  expect(screen.getByLabelText('Onboarding URL').textContent).toBe('/?from=registration#anchor')
  expect(calls.filter(call => call.method === 'PUT').map(call => call.path)).toEqual(Array(4).fill('/api/matchmaking/account'))
  expect(calls.every(call => call.path === '/api/matchmaking/account' || (call.method === 'GET' && call.path === '/api/matchmaking/notifications'))).toBe(true)
  expect(calls.some(call => /\/(queue|result|status)$/.test(call.path))).toBe(false)
})
it('partial older profiles resume saved interests and cannot advance with fewer than three, while missing required final fields remain required', async () => {
  stored = { ...emptyAccount, profile: { ...partial(), interests: ['Coffee'] }, completed: [0] }
  mount(); await screen.findByRole('button', { name: 'Save interests and continue', exact: true })
  expect(button('Coffee').getAttribute('aria-pressed')).toBe('true')
  fireEvent.submit(button('Save interests and continue').closest('form')!)
  expect(screen.getByRole('alert').textContent).toContain('three')
  expect(calls.every(call => call.method === 'GET')).toBe(true)
})
it('complete users, including valid no-marker accounts, never repeat onboarding on login/refresh or the legacy completion URL', async () => {
  stored = { ...accountFixture(complete), completed: [] }
  mount('/complete-profile?returnTo=%2F%3Ffrom%3Dlegacy')
  await screen.findByRole('heading', { name: 'Ready app fixture', exact: true })
  expect(screen.queryByLabelText('Username')).toBeNull()
  expect(screen.getByLabelText('Onboarding URL').textContent).toBe('/?from=legacy')
  expect(calls.every(call => call.method === 'GET')).toBe(true)
})
it('read failure blocks and retries without signup misclassification or writes', async () => {
  readFails = true; mount(); await screen.findByRole('heading', { name: 'Profile unavailable', exact: true })
  expect(screen.queryByLabelText('Username')).toBeNull()
  readFails = false; fireEvent.click(button('Retry account'))
  await screen.findByRole('heading', { name: 'Complete onboarding', exact: true })
  expect(calls.every(call => call.method === 'GET')).toBe(true)
})
it('identity-only interruption and failed interests retain the draft, never resubmit identity, and refresh resumes the persisted chapter', async () => {
  stored = { ...emptyAccount, profile: partial(), completed: [0] }; saveFails = true
  const view = mount('/onboarding?returnTo=%2F'); await screen.findByRole('button', { name: 'Save interests and continue', exact: true })
  for (const label of complete.interests) fireEvent.click(button(label))
  fireEvent.click(button('Save interests and continue'))
  await screen.findByText(/Account save could not be confirmed/)
  expect(button('Music').getAttribute('aria-pressed')).toBe('true')
  expect(stored.profile!.interests).toEqual([]); expect(calls.filter(call => call.method === 'PUT')).toHaveLength(1)
  view.unmount(); saveFails = false
  mount('/onboarding?returnTo=%2F'); await screen.findByRole('button', { name: 'Save interests and continue', exact: true })
  expect(screen.queryByLabelText('Username')).toBeNull(); expect(calls.filter(call => call.method === 'PUT')).toHaveLength(1)
})
it('duplicate/uncertain final saves reconcile read-only; no automatic resubmission or readiness until confirmed', async () => {
  lastChapter(); readbackFails = true
  let finish!: () => void; holdSave = new Promise(resolve => { finish = resolve })
  mount('/onboarding?returnTo=%2F'); await screen.findByRole('button', { name: 'Finish onboarding', exact: true })
  preferences(); const form = button('Finish onboarding').closest('form')!
  fireEvent.submit(form); fireEvent.submit(form)
  await waitFor(() => expect(calls.filter(call => call.method === 'PUT')).toHaveLength(1))
  await act(async () => { finish(); await holdSave })
  await screen.findByText(/Account save could not be confirmed/)
  expect(screen.queryByRole('heading', { name: 'Ready app fixture' })).toBeNull()
  expect(screen.getByLabelText('City or campus area')).toHaveProperty('value', complete.location_city)
  readbackFails = false; fireEvent.click(button('Retry account'))
  await screen.findByRole('heading', { name: 'Ready app fixture', exact: true })
  expect(calls.filter(call => call.method === 'PUT')).toHaveLength(1)
})
it('another tab identity is never overwritten and retry resumes its authoritative identity without discarding the unsaved draft early', async () => {
  mount(); await screen.findByRole('heading', { name: 'Complete onboarding', exact: true })
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'unsaved-draft' } })
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Unsaved draft' } })
  stored = { ...emptyAccount, profile: { ...partial(), username: 'other-tab-identity', display_name: 'Other tab identity' }, completed: [0] }
  fireEvent.click(button('Save identity and continue')); await screen.findByText(/Another tab changed your identity/)
  expect(calls.some(call => call.method === 'PUT')).toBe(false)
  expect(screen.getByLabelText('Username')).toHaveProperty('value', 'unsaved-draft')
  fireEvent.click(button('Retry account')); await screen.findByText('Other tab identity', { exact: true })
  expect(screen.queryByLabelText('Username')).toBeNull(); expect(screen.queryByRole('heading', { name: 'Ready app fixture' })).toBeNull()
})
it('owner/token swap during final save fences late callbacks and keeps the new owner on blank onboarding', async () => {
  lastChapter()
  let finish!: () => void; holdSave = new Promise(resolve => { finish = resolve })
  const originalFetch = vi.mocked(fetch).getMockImplementation()!
  vi.mocked(fetch).mockImplementation(async (input, init) => new Headers(init?.headers).get('Authorization') === 'Bearer second-owner' ? Response.json(emptyAccount) : originalFetch(input, init))
  const view = mount(); await screen.findByRole('button', { name: 'Finish onboarding', exact: true })
  preferences(); fireEvent.click(button('Finish onboarding'))
  await waitFor(() => expect(calls.filter(call => call.method === 'PUT')).toHaveLength(1))
  auth.session = { access_token: 'second-owner', user: { id: 'second-owner' } }
  view.rerender(<MemoryRouter initialEntries={['/']}><App /><Path /></MemoryRouter>)
  await waitFor(() => expect(screen.getByLabelText('Username')).toHaveProperty('value', ''))
  const before = calls.length; await act(async () => { finish(); await holdSave })
  expect(calls).toHaveLength(before); expect(screen.queryByRole('heading', { name: 'Ready app fixture' })).toBeNull()
})
it('ordinary Profile editing cannot clear readiness once onboarding is complete', async () => {
  stored = accountFixture(complete); mount('/profile')
  const edit = await screen.findByRole('button', { name: 'Edit profile', exact: true })
  await waitFor(() => expect((edit as HTMLButtonElement).disabled).toBe(false)); fireEvent.click(edit)
  await waitFor(() => expect(button('Save shared preferences').disabled).toBe(false))
  fireEvent.click(button('Coffee')); fireEvent.submit(button('Save shared preferences').closest('form')!)
  expect(screen.getByRole('alert').textContent).toContain('three'); expect(calls.some(call => call.method === 'PUT')).toBe(false)
  expect(completedAccountChapters(stored)).toEqual([0, 1, 2, 3])
})
