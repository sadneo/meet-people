import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import RealApp from '../src/App'
import { MatchingViews } from '../src/features/matchmaking/MatchingViews'
import { requiredPreferences } from './complete-profile-fixture'
function App() { return <MatchingViews mode={useLocation().pathname === '/downtime-matchmaking' ? 'downtime' : 'active'} /> }
import { MatchingSetup } from '../src/features/matchmaking/MatchingScreen'
import { MatchingProfileSchema } from '../shared/matchmaking'

const auth = vi.hoisted(() => ({ session: { access_token: 'user-jwt', user: { id: 'a0000000-0000-4000-8000-000000000001' } } as { access_token: string; user: { id: string } } | null }))
vi.mock('../src/auth/useSession', () => ({ useSession: () => ({ session: auth.session, ready: true }) }))
const profile = { username: 'sam', display_name: 'Sam', bio: null, avatar_url: null, ...requiredPreferences }
const candidate = { id: 'a0000000-0000-4000-8000-000000000002', name: 'Taylor', avatar: null, interests: ['Coffee'], overlap: 'some', mode: 'active', meetup: null }
let mode: string | null = null
let cancelFails = false
let resultResponse: Promise<Response> | null = null
let saveUnavailable = true
let profileInterests = ['Coffee']
let saveResponse: Promise<Response> | null = null
let profileResponse: Response | Promise<Response> | null = null
let canonicalIdentity = false
const requests: { path: string; method: string; authorization: string | null; body: unknown }[] = []
const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const path = String(input), method = init?.method ?? 'GET'
  requests.push({ path, method, authorization: new Headers(init?.headers).get('Authorization'), body: init?.body ? JSON.parse(String(init.body)) : null })
  if (path.endsWith('/account-profile')) return canonicalIdentity ? Response.json({ profile: { username: profile.username, display_name: profile.display_name, bio: profile.bio, avatar_url: profile.avatar_url } }) : Response.json({ code: 'unavailable', error: 'Account profile RPC not installed.' }, { status: 503 })
  if (path.startsWith('/api/connections/')) return Response.json({ status: method === 'POST' ? 'sent' : 'none', conversationId: null })
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
  profileInterests = [...profile.interests]; saveResponse = null; profileResponse = null; canonicalIdentity = true
  vi.stubGlobal('fetch', mockFetch); vi.stubGlobal('scrollTo', () => {})
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })
const mount = (path = '/matchmaking') => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
async function openPreferences() {
  fireEvent.click(await screen.findByRole('button', { name: 'Preferences' }))
  await waitFor(() => expect(screen.queryByText('Checking saved identity…')).toBeNull())
}

it('composes a saved active Friends profile into the inline setup hierarchy', async () => {
  profileResponse = Response.json({ profile: { ...profile, location_city: 'North campus', availability: [{ dow: 1, start_time: '08:00:00', end_time: '12:00:00' }] } })
  mount()
  const dashboard = within(await screen.findByRole('region', { name: 'Find your people', exact: true }))
  const controls = within(screen.getByRole('navigation', { name: 'Matching modes', exact: true }))
  expect(controls.queryByRole('link', { name: 'Matchmaking settings', exact: true })).toBeNull()
  expect(controls.getByRole('button', { name: 'Preferences', exact: true })).toBeTruthy()
  expect(dashboard.getByRole('heading', { name: 'Find your people', exact: true })).toBeTruthy()
  expect(dashboard.getByRole('button', { name: 'Coffee', exact: true }).getAttribute('aria-pressed')).toBe('true')
  expect(dashboard.getByRole('button', { name: 'Monday morning, available' }).getAttribute('aria-pressed')).toBe('true')
  expect(dashboard.getByRole('table').querySelectorAll('button')).toHaveLength(28)
  expect(dashboard.getByRole('button', { name: 'Find Friends', exact: true })).toBeTruthy()
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('renders and edits the dashboard without writes, queue enrollment or result lookup', async () => {
  mount()
  await screen.findByRole('region', { name: 'Find your people', exact: true })
  expect(screen.getByRole('button', { name: 'Sunday late, available' })).toBeTruthy()
  expect(screen.queryByRole('heading', { name: 'Places', exact: true })).toBeNull()
  expect(requests.some(request => request.method !== 'GET' || request.path.endsWith('/result'))).toBe(false)
  await openPreferences()
  expect(screen.queryByLabelText('City or campus area')).toBeNull()
  expect(screen.queryByLabelText('Birthdate (optional)')).toBeNull()
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Music', exact: true }))
  expect(requests.some(request => request.method !== 'GET' || /\/(queue|result)$/.test(request.path))).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }))
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Preferences', exact: true }))
  expect(screen.getByText('Coffee', { exact: true })).toBeTruthy()
  expect(screen.queryByText('Unsent area', { exact: true })).toBeNull()
})

it('uses inline setup then real queue actions for join, manual lookup and cancellation', async () => {
  mount()
  await screen.findByRole('form', { name: 'Matching profile setup' })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Find Friends', exact: true }).disabled).toBe(false))
  expect(requests.some(request => request.path.endsWith('/result'))).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Find Friends', exact: true }))
  await screen.findByRole('button', { name: 'Check for a match', exact: true })
  expect(requests.filter(request => request.method === 'POST')).toHaveLength(1)
  expect(document.querySelector('.friends-scene.is-searching')).toBeTruthy()
  expect(requests.some(request => request.path.endsWith('/result'))).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Check for a match', exact: true }))
  await screen.findByRole('heading', { name: 'Taylor', exact: true })
  fireEvent.click(screen.getByRole('button', { name: 'Cancel search', exact: true }))
  await screen.findByRole('button', { name: 'Find Friends', exact: true })
  expect(screen.queryByRole('heading', { name: 'Taylor', exact: true })).toBeNull()
  expect(document.querySelector('.friends-scene:not(.is-searching)')).toBeTruthy()
  expect(requests.filter(request => request.method === 'DELETE')).toHaveLength(1)
  expect(requests.filter(request => request.path.endsWith('/result'))).toHaveLength(1)
})

it('starting active matching replaces downtime with POST, never DELETE or automatic lookup', async () => {
  mode = 'downtime'
  mount()
  await screen.findByRole('button', { name: 'Find Friends', exact: true })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Find Friends', exact: true }).disabled).toBe(false))
  expect(screen.getByText(/Starting active matching replaces downtime matching/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Find Friends', exact: true }))
  await screen.findByRole('dialog', { name: 'Replace downtime matching?', exact: true })
  fireEvent.click(screen.getByRole('button', { name: 'Replace with active search', exact: true }))
  await screen.findByRole('button', { name: 'Cancel search', exact: true })
  expect(requests.filter(request => request.method === 'POST')).toMatchObject([{ body: { mode: 'active' } }])
  expect(requests.some(request => request.method === 'DELETE' || request.path.endsWith('/result'))).toBe(false)
})

it('an owned active queue can still be cancelled when profile loading fails', async () => {
  mode = 'active'
  profileResponse = Response.json({ code: 'unavailable', error: 'Profile service unavailable.' }, { status: 503 })
  mount()
  await screen.findByRole('alert')
  const cancel = screen.getByRole('button', { name: 'Cancel search', exact: true })
  await waitFor(() => expect(cancel.disabled).toBe(false))
  fireEvent.click(cancel)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Find Friends', exact: true }).disabled).toBe(true))
  expect(requests.filter(request => request.method === 'DELETE')).toHaveLength(1)
  expect(requests.some(request => request.method === 'POST' || request.path.endsWith('/result'))).toBe(false)
})

it('shows full-page Friends setup with real interests, weekly grid and campus input when no matching profile is saved', async () => {
  profileResponse = Response.json({ profile: null })
  canonicalIdentity = true
  mount()
  await screen.findByRole('heading', { name: 'Find your people' })
  const setup = within(screen.getByRole('region', { name: 'Find your people', exact: true }))
  expect(setup.queryByRole('navigation', { name: 'Matching modes', exact: true })).toBeNull()
  expect(setup.queryByRole('link', { name: 'Matchmaking settings', exact: true })).toBeNull()
  expect(screen.getByRole('link', { name: 'Dating', exact: true }).getAttribute('href')).toBe('/matchmaking?view=dating')
  expect(setup.getByRole('form', { name: 'Matching profile setup', exact: true })).toBeTruthy()
  expect(setup.getByRole('group', { name: 'Interests', exact: true })).toBeTruthy()
  expect(setup.getByRole('group', { name: 'Weekly availability', exact: true })).toBeTruthy()
  expect(setup.queryByRole('heading', { name: 'What brings you together', exact: true })).toBeNull()
  expect(within(setup.getByRole('group', { name: 'Matching setup actions', exact: true })).getByRole('button', { name: 'Find Friends' })).toBeTruthy()
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('table', { name: 'Weekly availability' })).toBeTruthy()
   expect(screen.getByRole('button', { name: 'Add yours' })).toBeTruthy()
  expect(screen.queryByLabelText('City or campus area')).toBeNull()
  expect(screen.queryByLabelText('Birthdate (optional)')).toBeNull()
  expect(screen.getByRole('button', { name: 'Find Friends' })).toBeTruthy()
   expect(document.querySelector('.match-setup .friends-mascot')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Dating', exact: true })).toBeNull()
  expect(requests.some(request => request.method === 'POST' || request.path.endsWith('/result'))).toBe(false)
})

for (const selected of ['active']) {
  const path = selected === 'active' ? '/matchmaking' : '/downtime-matchmaking'
  const startName = selected === 'active' ? 'Find Friends' : 'Turn on downtime matching'
  const leaveName = selected === 'active' ? 'Cancel search' : 'Pause downtime matching'
  it(`${selected} requires a successful server profile save, not a blank profile or failed save`, async () => {
    profileResponse = Response.json({ profile: null })
    canonicalIdentity = true
    mount(path)
    await screen.findByText('No matching profile saved yet.')
    if (selected === 'active') {
      await waitFor(() => expect(screen.queryByText('Checking saved identity…')).toBeNull())
      fireEvent.click(screen.getByRole('button', { name: startName, exact: true }))
      await screen.findByRole('alert')
      expect(requests.some(request => request.method === 'POST')).toBe(false)
      saveUnavailable = false
      fireEvent.click(screen.getByRole('button', { name: startName, exact: true }))
      expect(requests.find(request => request.method === 'PUT')).toMatchObject({ body: { interests: [] } })
      await screen.findByRole('button', { name: leaveName, exact: true })
      expect(requests.find(request => request.method === 'POST')).toMatchObject({ body: { mode: selected } })
      expect(requests.some(request => request.path.endsWith('/result'))).toBe(false)
      return
    }
    const start = screen.getByRole('button', { name: startName, exact: true })
    expect(start.disabled).toBe(true)
    fireEvent.click(start)
    expect(requests.some(request => request.method === 'POST')).toBe(false)
    await openPreferences()
    expect(screen.queryByLabelText('Username')).toBeNull()
    expect(screen.queryByLabelText('Display name')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }))
    await screen.findByRole('alert')
    expect(start.disabled).toBe(true)
    expect(requests.some(request => request.method === 'POST')).toBe(false)
    saveUnavailable = false
    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }))
    await waitFor(() => expect(screen.getByRole('button', { name: startName, exact: true }).disabled).toBe(false))
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
    await waitFor(() => expect(screen.getByRole('button', { name: startName, exact: true }).disabled).toBe(false))
  })
  it(`${selected} cannot cancel downtime or replace it when profile load fails; status refresh remains safe`, async () => {
    mode = selected === 'active' ? 'downtime' : 'active'
    profileResponse = Response.json({ code: 'unavailable', error: 'Profile service unavailable.' }, { status: 503 })
    mount(path)
    await screen.findByRole('alert')
    expect(screen.queryByRole('button', { name: leaveName, exact: true })).toBeNull()
    expect(screen.getByRole('button', { name: startName, exact: true }).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh status' }))
    await waitFor(() => expect(requests.filter(request => request.path.endsWith('/status'))).toHaveLength(2))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh status', exact: true }).disabled).toBe(false))
    expect(screen.getByRole('button', { name: startName, exact: true }).disabled).toBe(true)
    expect(requests.some(request => request.method === 'DELETE')).toBe(false)
    expect(requests.some(request => request.method === 'POST')).toBe(false)
  })
}

it('assembles valid real preferences then starts the actual queue without automatic results', async () => {
  profileResponse = Response.json({ profile: null }); canonicalIdentity = true; saveUnavailable = false
  mount()
  await screen.findByRole('form', { name: 'Matching profile setup' })
  const save = await screen.findByRole('button', { name: 'Find Friends' })
  await waitFor(() => expect(save.disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Add yours' }))
  fireEvent.change(screen.getByLabelText('Add a matching interest'), { target: { value: 'Coffee' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add interest', exact: true }))
  fireEvent.change(screen.getByLabelText('Add a matching interest'), { target: { value: 'Music' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add interest', exact: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Coffee', exact: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Monday morning, not available' }))
  fireEvent.click(screen.getByRole('button', { name: 'Sunday late, not available' }))
  expect(requests.some(request => request.method === 'POST' || request.path.endsWith('/result'))).toBe(false)
  fireEvent.click(save)
  await screen.findByRole('button', { name: 'Cancel search' })
  const payload = requests.find(request => request.method === 'PUT')!.body
  expect(MatchingProfileSchema.safeParse(payload).success).toBe(true)
  expect(payload).toEqual({ ...profile, birthdate: null, location_city: null, interests: ['Music'], availability: [{ dow: 1, start_time: '08:00:00', end_time: '12:00:00' }, { dow: 0, start_time: '21:00:00', end_time: '24:00:00' }] })
  expect(requests.filter(request => request.method === 'POST')).toHaveLength(1)
  expect(requests.some(request => request.path.endsWith('/result'))).toBe(false)
})

it('keeps exact custom windows, midnight ends, multiline interests and legacy server identity on unrelated edits', async () => {
  const initial = { ...profile, location_city: 'Keep campus', birthdate: '2000-01-01', interests: ['Board games\nstrategy', 'Coffee'], availability: [{ dow: 2, start_time: '09:15:00', end_time: '11:45:00' }, { dow: 0, start_time: '21:00:00', end_time: '24:00:00' }] }
  const save = vi.fn(async () => true)
  render(<MemoryRouter><MatchingSetup initial={initial} token="user-jwt" busy={false} error="" save={save} /></MemoryRouter>)
  await waitFor(() => expect(screen.queryByText('Checking saved identity…')).toBeNull())
  expect(screen.getByRole('button', { name: 'Tuesday morning, custom times; edit exact windows' }).disabled).toBe(true)
  expect(screen.getByRole('button', { name: 'Sunday late, available' }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.queryByLabelText('City or campus area')).toBeNull()
  expect(screen.queryByLabelText('Birthdate (optional)')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Monday afternoon, not available' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save matching preferences' }))
  expect(save).toHaveBeenCalledWith({ ...initial, availability: [...initial.availability, { dow: 1, start_time: '12:00:00', end_time: '17:00:00' }] })
  expect(requests.every(request => request.path.endsWith('/account-profile'))).toBe(true)
})

it('blocks full-page setup without saved server identity, never borrowing session-only Profile identity', async () => {
  canonicalIdentity = false
  profileResponse = Response.json({ profile: null })
  render(<MemoryRouter initialEntries={['/matchmaking']}><RealApp /></MemoryRouter>)
  await screen.findByRole('heading', { name: 'Profile unavailable', exact: true })
  expect(screen.queryByRole('button', { name: 'Find Friends' })).toBeNull()
  expect(requests.some(request => request.method === 'PUT' || request.method === 'POST' || request.path.endsWith('/result'))).toBe(false)
})

it('blocks setup when the canonical service explicitly returns no account identity', async () => {
  mockFetch.mockResolvedValueOnce(Response.json({ profile: null }))
  const save = vi.fn(async () => true)
  render(<MemoryRouter><MatchingSetup token="user-jwt" busy={false} error="" save={save} /></MemoryRouter>)
  await screen.findByText(/No saved account identity is available/)
  const submit = screen.getByRole('button', { name: 'Save matching preferences' })
  expect(submit.disabled).toBe(true)
  fireEvent.submit(submit.closest('form')!)
  expect(save).not.toHaveBeenCalled()
})

it('validates overlapping custom windows locally without a profile write', async () => {
  profileResponse = Response.json({ profile: null }); canonicalIdentity = true
  mount()
  await screen.findByRole('form', { name: 'Matching profile setup' })
  const save = await screen.findByRole('button', { name: 'Find Friends' })
  await waitFor(() => expect(save.disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Monday evening, not available' }))
  fireEvent.click(screen.getByText('Exact time windows (1)'))
  fireEvent.click(screen.getByRole('button', { name: 'Add time window' }))
  fireEvent.click(save)
  expect((await screen.findByRole('alert')).textContent).toContain('non-overlapping')
  expect(requests.some(request => request.method === 'PUT')).toBe(false)
})

it('requires a real session, never a demo login', () => {
  auth.session = null
  mount()
  expect(screen.getByRole('heading', { name: 'Sign in to match' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Find Friends' })).toBeNull()
  expect(requests).toHaveLength(0)
})
it('loads server status, joins, looks up one person explicitly and cancels', async () => {
  mount()
  expect(screen.getByRole('status').textContent).toContain('Loading')
  await screen.findByRole('button', { name: 'Find Friends' })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Find Friends', exact: true }).disabled).toBe(false))
  expect(requests.some(r => r.path.endsWith('/result'))).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Find Friends', exact: true }))
  await screen.findByRole('button', { name: 'Cancel search' })
  fireEvent.click(screen.getByRole('button', { name: 'Check for a match' }))
  await screen.findByRole('heading', { name: 'Taylor' })
  expect(screen.queryByText(/Groups of 3/)).toBeNull()
  expect(requests.find(r => r.method === 'POST')).toMatchObject({ authorization: 'Bearer user-jwt', body: { mode: 'active' } })
  fireEvent.click(screen.getByRole('button', { name: 'Cancel search' }))
  await screen.findByRole('button', { name: 'Find Friends' })
  expect(screen.queryByText('Taylor')).toBeNull()
})
it('sends a connection request to the displayed candidate', async () => {
  mount()
  await screen.findByRole('button', { name: 'Find Friends' })
  // Profile/status hydration replaces the initial disabled action with inline setup.
  await waitFor(() => expect(screen.getByRole('button', { name: 'Find Friends', exact: true }).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Find Friends', exact: true }))
  fireEvent.click(await screen.findByRole('button', { name: 'Check for a match' }))
  await screen.findByRole('heading', { name: 'Taylor' })
  const connect = await screen.findByRole('button', { name: 'Connect' })
  await waitFor(() => expect(connect.hasAttribute('disabled')).toBe(false))
  fireEvent.click(connect)
  await screen.findByText('Request sent')
  expect(requests.filter(r => r.path.startsWith('/api/connections/') && r.method === 'POST')).toEqual([expect.objectContaining({ path: `/api/connections/${candidate.id}`, body: {} })])
  expect(screen.getByRole('button', { name: 'Cancel request' })).toBeTruthy()
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
  await screen.findByRole('button', { name: 'Find Friends' })
  await act(async () => { resolve(Response.json({ candidate })); await resultResponse })
  expect(screen.queryByText('Taylor')).toBeNull()
})
it('does not claim a profile save succeeded when the atomic RPC is unavailable', async () => {
  mount()
  await openPreferences()
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Music', exact: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }))
  await screen.findByRole('alert')
  expect(screen.getByRole('dialog')).toBeTruthy()
  expect(localStorage.getItem('pebble.matchmaking-profile')).toBeNull()
})
it('updates the profile only from a successful API save', async () => {
  saveUnavailable = false
  profileResponse = Response.json({ profile: { ...profile, location_city: 'Saved campus', birthdate: '2000-01-01' } })
  mount()
  await openPreferences()
  expect(screen.queryByLabelText('City or campus area')).toBeNull()
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Music', exact: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  await openPreferences()
  expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Music', exact: true }).getAttribute('aria-pressed')).toBe('true')
  expect(requests.find(request => request.method === 'PUT')).toMatchObject({ authorization: 'Bearer user-jwt', body: { display_name: 'Sam', birthdate: '2000-01-01', location_city: 'Saved campus' } })
})
it('matching preferences cannot reduce a ready profile below three interests or write an incomplete draft', async () => {
  saveUnavailable = false
  mount(); await openPreferences()
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Coffee', exact: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Save preferences', exact: true }))
  expect((await screen.findByRole('alert')).textContent).toContain('three unique interests')
  expect(screen.getByRole('dialog')).toBeTruthy()
  expect(requests.some(request => request.method !== 'GET')).toBe(false)
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
  fireEvent.click(await screen.findByText('On this device'))
  fireEvent.change(await screen.findByLabelText('Travel range (device only)'), { target: { value: 'Under 10 min' } })
  fireEvent.click(screen.getByLabelText('Coffee shops'))
  fireEvent.click(screen.getByRole('button', { name: 'Save device display fields' }))
  await screen.findByText('Display fields saved on this device only.')
  expect(localStorage.getItem('pebble.matchmaking-display-preferences')).toContain('Coffee shops')
  expect(requests.some(request => request.method === 'PUT' || request.method === 'POST')).toBe(false)
  expect(screen.getByText(/algorithm does not enforce them/)).toBeTruthy()
})
it('preserves a multiline interest on an unrelated profile edit, with per-label add/edit/remove controls', async () => {
  profileInterests = ['Board games\nstrategy', 'Coffee', 'Art']
  saveUnavailable = false
  mount()
  await openPreferences()
  expect(screen.getByRole('button', { name: 'Board games\nstrategy', exact: true }).getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(requests.find(request => request.method === 'PUT')).toMatchObject({ body: { interests: profileInterests } })
  await openPreferences()
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Coffee', exact: true }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Music', exact: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(requests.filter(request => request.method === 'PUT')[1]).toMatchObject({ body: { interests: ['Board games\nstrategy', 'Art', 'Music'] } })
})
it('clears a displayed candidate on profile save without automatic re-scoring', async () => {
  mode = 'active'; saveUnavailable = false
  mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Check for a match' }))
  await screen.findByRole('heading', { name: 'Taylor' })
  await openPreferences()
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
  await openPreferences()
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
