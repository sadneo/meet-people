import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from '../src/App'
import { requiredPreferences } from './complete-profile-fixture'

const auth = vi.hoisted(() => ({ ready: true, session: { access_token: 'fixture-token', user: { id: 'fixture-actor' } } as { access_token: string; user: { id: string } } | null }))
vi.mock('../src/auth/useSession', () => ({ useSession: () => auth }))
vi.mock('../src/supabase', () => ({ supabase: null }))
const profile = { username: 'fixture', display_name: 'Fixture', bio: null, avatar_url: null, ...requiredPreferences }
let mode: 'active' | 'downtime' | null = null
let missingProfile = false, missingIdentity = false, failStatus = false, failWrite = false, uncertainWrite = false
let holdStatus: Promise<void> | null = null, holdWrite: Promise<void> | null = null
let failReadbackAfterWrite = false
const calls: { path: string; method: string; body: unknown }[] = []
beforeEach(() => {
  auth.ready = true; auth.session = { access_token: 'fixture-token', user: { id: 'fixture-actor' } }
  mode = null; missingProfile = false; missingIdentity = false; failStatus = false; failWrite = false; uncertainWrite = false; calls.length = 0
  holdStatus = null; holdWrite = null; failReadbackAfterWrite = false
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  vi.stubGlobal('scrollTo', () => {})
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input), method = init?.method ?? 'GET', body = init?.body ? JSON.parse(String(init.body)) : null
    calls.push({ path, method, body })
    if (path.endsWith('/notifications')) return Response.json({ notifications: [], unreadCount: 0 })
    if (path.endsWith('/account-profile')) return Response.json({ profile: missingIdentity ? null : { username: profile.username, display_name: profile.display_name, bio: profile.bio, avatar_url: profile.avatar_url } })
    if (path.endsWith('/profile')) return Response.json({ profile: missingProfile ? null : profile })
    if (path.endsWith('/status')) { if (holdStatus) await holdStatus; return failStatus ? Response.json({ code: 'unavailable', error: 'Status unavailable.' }, { status: 503 }) : Response.json({ mode }) }
    if (path.endsWith('/queue')) {
      if (holdWrite) await holdWrite
      if (!failWrite || uncertainWrite) mode = method === 'POST' ? body.mode : null
      if (failReadbackAfterWrite) failStatus = true
      if (failWrite) return Response.json({ code: 'provider', error: 'Queue write uncertain.' }, { status: 503 })
      return Response.json({ mode })
    }
    throw new Error('Unexpected test request')
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })
const mount = (path = '/settings') => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
const writes = () => calls.filter(call => call.method !== 'GET')
const toggle = () => screen.getByRole('switch', { name: 'Allow downtime matching', exact: true }) as HTMLButtonElement
async function ready() { const control = await screen.findByRole('switch', { name: 'Allow downtime matching', exact: true }); await waitFor(() => expect((control as HTMLButtonElement).disabled).toBe(false)); return control }

it('Settings reads confirmed queue state without enrolling or looking up a result, then enables and disables downtime with status readback', async () => {
  mount(); await ready()
  expect(toggle().getAttribute('aria-checked')).toBe('false')
  expect(writes()).toEqual([])
  expect(calls.some(call => call.path.endsWith('/result'))).toBe(false)
  fireEvent.click(toggle())
  await waitFor(() => expect(toggle().getAttribute('aria-checked')).toBe('true'))
  await waitFor(() => expect(toggle().disabled).toBe(false))
  expect(writes()).toEqual([{ path: '/api/matchmaking/queue', method: 'POST', body: { mode: 'downtime' } }])
  expect(calls.at(-1)).toMatchObject({ path: '/api/matchmaking/account-profile', method: 'GET' })
  fireEvent.click(toggle())
  await waitFor(() => expect(toggle().getAttribute('aria-checked')).toBe('false'))
  expect(writes().map(call => call.method)).toEqual(['POST', 'DELETE'])
})

it('replacing active matching requires explicit confirmation and cancel performs no write', async () => {
  mode = 'active'; mount(); await ready()
  toggle().focus(); fireEvent.click(toggle())
  const confirmation = within(screen.getByRole('dialog', { name: 'Replace active matching?', exact: true }))
  expect(confirmation.getByText(/one queue/i)).toBeTruthy()
  fireEvent.click(confirmation.getByRole('button', { name: 'Cancel', exact: true }))
  expect(writes()).toEqual([]); expect(mode).toBe('active')
  fireEvent.click(toggle())
  fireEvent.click(screen.getByRole('button', { name: 'Replace with downtime', exact: true }))
  await waitFor(() => expect(mode).toBe('downtime'))
  expect(writes()).toEqual([{ path: '/api/matchmaking/queue', method: 'POST', body: { mode: 'downtime' } }])
})

it('an off request never deletes an active queue discovered during preflight', async () => {
  mode = 'downtime'; mount(); await ready()
  mode = 'active'
  fireEvent.click(toggle())
  await waitFor(() => expect(toggle().getAttribute('aria-checked')).toBe('false'))
  expect(mode).toBe('active'); expect(writes()).toEqual([])
})

it('unknown status does not expose a confirmed off switch or permit writes', async () => {
  failStatus = true; mount()
  await screen.findByText(/Status unavailable/)
  expect(screen.queryByRole('switch', { name: 'Allow downtime matching' })).toBeNull()
  expect(writes()).toEqual([])
})

it('signed-out, loading, missing-profile and missing-identity states cannot enable downtime', async () => {
  auth.session = null; const view = mount()
  expect(screen.queryByRole('switch', { name: 'Allow downtime matching' })).toBeNull()
  expect(writes()).toEqual([]); view.unmount()
  auth.session = { access_token: 'fixture-token', user: { id: 'fixture-actor' } }; missingProfile = true
  const second = mount(); await screen.findByRole('heading', { name: 'Complete onboarding', exact: true })
  expect(screen.queryByRole('switch', { name: 'Allow downtime matching' })).toBeNull(); expect(writes()).toEqual([]); second.unmount()
  missingProfile = false; missingIdentity = true
  mount(); await screen.findByRole('heading', { name: 'Complete onboarding', exact: true })
  expect(screen.queryByRole('switch', { name: 'Allow downtime matching' })).toBeNull(); expect(writes()).toEqual([])
})

it('failed or uncertain mutations reconcile the actual queue without fabricating success', async () => {
  failWrite = true; uncertainWrite = true; mount(); await ready()
  fireEvent.click(toggle())
  await screen.findByText(/Queue write uncertain/)
  await waitFor(() => expect(toggle().getAttribute('aria-checked')).toBe('true'))
  expect(calls.filter(call => call.path.endsWith('/status')).length).toBeGreaterThanOrEqual(3)
  expect(writes()).toHaveLength(1)
})

it('pending status and pending Auth never expose a confirmed off switch or auto-write', async () => {
  auth.ready = false
  const first = mount()
  expect(screen.queryByRole('switch', { name: 'Allow downtime matching' })).toBeNull()
  expect(calls.some(call => call.path.endsWith('/status'))).toBe(false)
  first.unmount(); auth.ready = true
  let finish!: () => void
  holdStatus = new Promise(resolve => { finish = resolve })
  mount()
  expect(screen.queryByRole('switch', { name: 'Allow downtime matching' })).toBeNull()
  expect(await screen.findByText(/Queue status not confirmed/)).toBeTruthy()
  await act(async () => { finish(); await holdStatus })
  await ready()
  expect(writes()).toEqual([])
})

it('guards repeated actions while a queue write is pending', async () => {
  mount(); const control = await ready()
  let finish!: () => void
  holdWrite = new Promise(resolve => { finish = resolve })
  fireEvent.click(control); fireEvent.click(control); fireEvent.click(control)
  await waitFor(() => expect(writes()).toHaveLength(1))
  expect(toggle().disabled).toBe(true)
  await act(async () => { finish(); await holdWrite })
  await waitFor(() => expect(toggle().getAttribute('aria-checked')).toBe('true'))
  expect(writes()).toHaveLength(1)
})

it('successful mutation with failed readback shows unknown current status, then reload confirms without another write', async () => {
  mount(); await ready(); failReadbackAfterWrite = true
  fireEvent.click(toggle())
  await screen.findByText(/Status unavailable/)
  expect(screen.queryByRole('switch', { name: 'Allow downtime matching' })).toBeNull()
  expect(screen.getByText(/Last confirmed: Downtime matching off/)).toBeTruthy()
  failStatus = false
  fireEvent.click(screen.getByRole('button', { name: 'Reload matchmaking status', exact: true }))
  await waitFor(() => expect(toggle().getAttribute('aria-checked')).toBe('true'))
  expect(writes()).toHaveLength(1)
})

it('a rejected write retains confirmed off after reconciliation and permits a deliberate retry', async () => {
  failWrite = true; mount(); await ready()
  fireEvent.click(toggle())
  await screen.findByText(/Queue write uncertain/)
  await waitFor(() => expect(toggle().disabled).toBe(false))
  expect(toggle().getAttribute('aria-checked')).toBe('false')
  failWrite = false; fireEvent.click(toggle())
  await waitFor(() => expect(toggle().getAttribute('aria-checked')).toBe('true'))
  expect(writes()).toHaveLength(2)
})

it('an active queue discovered during enable preflight still requires confirmation', async () => {
  mount(); await ready(); mode = 'active'
  fireEvent.click(toggle())
  await screen.findByRole('dialog', { name: 'Replace active matching?', exact: true })
  fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }))
  expect(writes()).toEqual([]); expect(mode).toBe('active')
})

it('rechecks identity prerequisites before a write instead of trusting the mounted snapshot', async () => {
  mount(); await ready(); missingIdentity = true
  fireEvent.click(toggle())
  await screen.findByText(/saved server identity is required/i)
  expect(toggle().disabled).toBe(true)
  expect(writes()).toEqual([]); expect(mode).toBeNull()
})
