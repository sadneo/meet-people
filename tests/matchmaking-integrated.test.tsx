import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from '../src/App'

const auth = vi.hoisted(() => ({ session: { access_token: 'user-jwt', user: { id: 'a0000000-0000-4000-8000-000000000001' } } as { access_token: string; user: { id: string } } | null }))
vi.mock('../src/auth/useSession', () => ({ useSession: () => ({ session: auth.session, ready: true }) }))
const profile = { username: 'sam', display_name: 'Sam', bio: null, birthdate: null, location_city: null, avatar_url: null, interests: ['Coffee'], availability: [] }
const candidate = { id: 'a0000000-0000-4000-8000-000000000002', name: 'Taylor', avatar: null, interests: ['Coffee'], overlap: 'some', mode: 'active', meetup: null }
let mode: string | null = null
let cancelFails = false
let resultResponse: Promise<Response> | null = null
let saveUnavailable = true
let profileInterests = ['Coffee']
let saveResponse: Promise<Response> | null = null
let profileResponse: Response | Promise<Response> | null = null
const requests: { path: string; method: string; authorization: string | null; body: unknown }[] = []
const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const path = String(input), method = init?.method ?? 'GET'
  requests.push({ path, method, authorization: new Headers(init?.headers).get('Authorization'), body: init?.body ? JSON.parse(String(init.body)) : null })
  if (path.endsWith('/profile')) return method === 'PUT' ? saveResponse ?? (saveUnavailable ? Response.json({ code: 'unavailable', error: 'Matching RPC is not available yet.' }, { status: 503 }) : Response.json({ profile: JSON.parse(String(init?.body)) })) : profileResponse ?? Response.json({ profile: { ...profile, interests: profileInterests } })
  if (path.endsWith('/result')) return resultResponse ?? Response.json({ candidate })
  if (method === 'POST') mode = JSON.parse(String(init?.body)).mode
  if (method === 'DELETE') {
    if (cancelFails) return Response.json({ code: 'provider', error: 'Matching service failed. Please try again.' }, { status: 503 })
    mode = null
  }
  return Response.json({ mode })
})
beforeEach(() => {
  auth.session = { access_token: 'user-jwt', user: { id: 'a0000000-0000-4000-8000-000000000001' } }
  mode = null; cancelFails = false; resultResponse = null; saveUnavailable = true; requests.length = 0
  profileInterests = ['Coffee']; saveResponse = null; profileResponse = null
  vi.stubGlobal('fetch', mockFetch); vi.stubGlobal('scrollTo', () => {})
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })
const mount = (path = '/matchmaking') => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)

for (const selected of ['active', 'downtime']) {
  const path = selected === 'active' ? '/matchmaking' : '/downtime-matchmaking'
  const startName = selected === 'active' ? 'Start matching' : 'Turn on downtime matching'
  const leaveName = selected === 'active' ? 'Cancel search' : 'Pause downtime matching'
  it(`${selected} requires a successful server profile save, not a blank profile or failed save`, async () => {
    profileResponse = Response.json({ profile: null })
    mount(path)
    await screen.findByText('No matching profile saved yet.')
    const start = screen.getByRole('button', { name: startName, exact: true })
    expect(start.disabled).toBe(true)
    fireEvent.click(start)
    expect(requests.some(request => request.method === 'POST')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Preferences' }))
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'sam' } })
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Sam' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }))
    await screen.findByRole('alert')
    expect(start.disabled).toBe(true)
    expect(requests.some(request => request.method === 'POST')).toBe(false)
    saveUnavailable = false
    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }))
    await waitFor(() => expect(start.disabled).toBe(false))
    expect(requests.find(request => request.method === 'PUT')).toMatchObject({ body: { interests: [] } })
    fireEvent.click(start)
    await screen.findByRole('button', { name: leaveName, exact: true })
    expect(requests.find(request => request.method === 'POST')).toMatchObject({ body: { mode: selected } })
    expect(requests.some(request => request.path.endsWith('/result'))).toBe(false)
  })
  it(`${selected} blocks enrollment during profile loading and failure, then permits it after retry`, async () => {
    let finish!: (response: Response) => void
    profileResponse = new Promise(resolve => { finish = resolve })
    mount(path)
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Ready when you are'))
    const start = screen.getByRole('button', { name: startName, exact: true })
    expect(start.disabled).toBe(true)
    fireEvent.click(start)
    await act(async () => { finish(Response.json({ code: 'unavailable', error: 'Profile service unavailable.' }, { status: 503 })); await profileResponse })
    await screen.findByRole('alert')
    expect(start.disabled).toBe(true)
    expect(requests.some(request => request.method === 'POST')).toBe(false)
    profileResponse = null
    fireEvent.click(screen.getByRole('button', { name: 'Retry profile' }))
    await waitFor(() => expect(start.disabled).toBe(false))
  })
  it(`${selected} can refresh and leave an existing queue when profile load fails, but cannot switch or re-enroll`, async () => {
    mode = selected === 'active' ? 'downtime' : 'active'
    profileResponse = Response.json({ code: 'unavailable', error: 'Profile service unavailable.' }, { status: 503 })
    mount(path)
    await screen.findByRole('alert')
    await waitFor(() => expect(screen.getByRole('button', { name: leaveName, exact: true }).disabled).toBe(false))
    expect(screen.getByRole('button', { name: `Switch to ${selected} queue`, exact: true }).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh status' }))
    await waitFor(() => expect(requests.filter(request => request.path.endsWith('/status'))).toHaveLength(2))
    await waitFor(() => expect(screen.getByRole('button', { name: leaveName, exact: true }).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: leaveName, exact: true }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Ready when you are'))
    expect(screen.getByRole('button', { name: startName, exact: true }).disabled).toBe(true)
    expect(requests.some(request => request.method === 'DELETE')).toBe(true)
    expect(requests.some(request => request.method === 'POST')).toBe(false)
  })
}

it('requires a real session, never a demo login', () => {
  auth.session = null
  mount()
  expect(screen.getByRole('heading', { name: 'Sign in to match' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Start matching' })).toBeNull()
  expect(requests).toHaveLength(0)
})
it('loads server status, joins, looks up one person explicitly and cancels', async () => {
  mount()
  expect(screen.getByRole('status').textContent).toContain('Loading')
  const start = await screen.findByRole('button', { name: 'Start matching' })
  await waitFor(() => expect(start.disabled).toBe(false))
  expect(requests.some(r => r.path.endsWith('/result'))).toBe(false)
  fireEvent.click(start)
  await screen.findByRole('button', { name: 'Cancel search' })
  fireEvent.click(screen.getByRole('button', { name: 'Check for a match' }))
  await screen.findByRole('heading', { name: 'Taylor' })
  expect(screen.queryByText(/Groups of 3/)).toBeNull()
  expect(requests.find(r => r.method === 'POST')).toMatchObject({ authorization: 'Bearer user-jwt', body: { mode: 'active' } })
  fireEvent.click(screen.getByRole('button', { name: 'Cancel search' }))
  await screen.findByRole('button', { name: 'Start matching' })
  expect(screen.queryByText('Taylor')).toBeNull()
})
it('retains server queue status when cancellation fails', async () => {
  mode = 'active'; cancelFails = true
  mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel search' }))
  await screen.findByRole('alert')
  expect(screen.getByRole('button', { name: 'Cancel search' })).toBeTruthy()
  expect(screen.getByRole('status').textContent).toContain('active queue')
})
it('ignores a late result after cancellation', async () => {
  mode = 'active'
  let resolve!: (response: Response) => void
  resultResponse = new Promise(done => { resolve = done })
  mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Check for a match' }))
  fireEvent.click(screen.getByRole('button', { name: 'Cancel search' }))
  await screen.findByRole('button', { name: 'Start matching' })
  await act(async () => { resolve(Response.json({ candidate })); await resultResponse })
  expect(screen.queryByText('Taylor')).toBeNull()
})
it('does not claim a profile save succeeded when the atomic RPC is unavailable', async () => {
  mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Preferences' }))
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'New name' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }))
  await screen.findByRole('alert')
  expect(screen.getByRole('dialog')).toBeTruthy()
  expect(localStorage.getItem('pebble.matchmaking-profile')).toBeNull()
})
it('updates the profile only from a successful API save', async () => {
  saveUnavailable = false
  mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Preferences' }))
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Saved name' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }))
  await screen.findByText('Saved name')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(requests.find(request => request.method === 'PUT')).toMatchObject({ authorization: 'Bearer user-jwt', body: { display_name: 'Saved name', birthdate: null, location_city: null } })
})
it('discards a late candidate from the previous session', async () => {
  mode = 'active'
  let resolve!: (response: Response) => void
  resultResponse = new Promise(done => { resolve = done })
  const view = mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Check for a match' }))
  auth.session = { access_token: 'another-user-jwt', user: { id: 'a0000000-0000-4000-8000-000000000003' } }
  view.rerender(<MemoryRouter initialEntries={['/matchmaking']}><App /></MemoryRouter>)
  await act(async () => { resolve(Response.json({ candidate })); await resultResponse })
  expect(screen.queryByText('Taylor')).toBeNull()
  await waitFor(() => expect(requests.some(request => request.authorization === 'Bearer another-user-jwt')).toBe(true))
})
it('keeps places and travel range explicitly device-only and out of server profile writes', async () => {
  mount()
  fireEvent.change(await screen.findByLabelText('Travel range (device only)'), { target: { value: 'Under 10 min' } })
  fireEvent.click(screen.getByLabelText('Coffee shops'))
  fireEvent.click(screen.getByRole('button', { name: 'Save device display fields' }))
  await screen.findByText('Display fields saved on this device only.')
  expect(localStorage.getItem('pebble.matchmaking-display-preferences')).toContain('Coffee shops')
  expect(requests.some(request => request.method === 'PUT' || request.method === 'POST')).toBe(false)
  expect(screen.getByText(/algorithm does not enforce them/)).toBeTruthy()
})
it('preserves a multiline interest on an unrelated profile edit, with per-label add/edit/remove controls', async () => {
  profileInterests = ['Board games\nstrategy', 'Coffee']
  saveUnavailable = false
  mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Preferences' }))
  expect(screen.getByLabelText('Interest 1').textContent).toBe('Board games\nstrategy')
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Saved name' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }))
  await screen.findByText('Saved name')
  expect(requests.find(request => request.method === 'PUT')).toMatchObject({ body: { interests: profileInterests } })
  fireEvent.click(screen.getByRole('button', { name: 'Preferences' }))
  fireEvent.change(screen.getByLabelText('Interest 1'), { target: { value: 'Board games\nnew strategy' } })
  fireEvent.click(screen.getByRole('button', { name: 'Remove interest 2' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add interest' }))
  fireEvent.change(screen.getByLabelText('Interest 2'), { target: { value: 'Music\nlive shows' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(requests.filter(request => request.method === 'PUT')[1]).toMatchObject({ body: { interests: ['Board games\nnew strategy', 'Music\nlive shows'] } })
})
it('clears a displayed candidate on profile save without automatic re-scoring', async () => {
  mode = 'active'; saveUnavailable = false
  mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Check for a match' }))
  await screen.findByRole('heading', { name: 'Taylor' })
  fireEvent.click(screen.getByRole('button', { name: 'Preferences' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(screen.queryByRole('heading', { name: 'Taylor' })).toBeNull()
  expect(requests.filter(request => request.path.endsWith('/result'))).toHaveLength(1)
})
for (const lookupTiming of ['during', 'after']) {
it(`invalidates a delayed lookup resolving ${lookupTiming} profile save, clears checking, and never re-scores automatically`, async () => {
  mode = 'active'
  let finishLookup!: (response: Response) => void
  let finishSave!: (response: Response) => void
  resultResponse = new Promise(resolve => { finishLookup = resolve })
  saveResponse = new Promise(resolve => { finishSave = resolve })
  mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Check for a match' }))
  fireEvent.click(screen.getByRole('button', { name: 'Preferences' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }))
  expect(screen.queryByRole('button', { name: 'Checking…', hidden: true })).toBeNull()
  if (lookupTiming === 'during') {
    await act(async () => { finishLookup(Response.json({ candidate })); await resultResponse })
    expect(screen.queryByRole('heading', { name: 'Taylor', hidden: true })).toBeNull()
  }
  await act(async () => { finishSave(Response.json({ profile })); await saveResponse })
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  if (lookupTiming === 'after') await act(async () => { finishLookup(Response.json({ candidate })); await resultResponse })
  expect(screen.queryByRole('heading', { name: 'Taylor' })).toBeNull()
  expect(requests.filter(request => request.path.endsWith('/result'))).toHaveLength(1)
  expect(screen.getByRole('button', { name: 'Check for a match' })).toBeTruthy()
})
}
