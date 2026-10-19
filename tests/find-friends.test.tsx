import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MatchingViews } from '../src/features/matchmaking/MatchingViews'
function App() { return <MatchingViews mode="active" /> }
import { MatchingSetup } from '../src/features/matchmaking/MatchingScreen'

vi.mock('../src/supabase', () => ({ supabase: null }))
const auth = vi.hoisted(() => ({ ready: true, session: { access_token: 'first', user: { id: 'first' } } }))
vi.mock('../src/auth/useSession', () => ({ useSession: () => auth }))
const identity = { username: 'fixture', display_name: 'Fixture', bio: null, avatar_url: null }
const saved = { ...identity, birthdate: null, location_city: null, interests: ['Music', 'Board games\nstrategy'], availability: [{ dow: 0, start_time: '21:00:00', end_time: '24:00:00' }] }
let profile: typeof saved | null, mode: 'active' | 'downtime' | null
let identityFails: boolean, saveFails: boolean, profileFails: boolean
let holdSave: Promise<void> | null, holdProfile: Promise<void> | null
let holdJoin: Promise<void> | null, malformedSave: boolean, joinFails: boolean
const calls: { path: string; method: string; body: unknown }[] = []
beforeEach(() => {
  auth.session = { access_token: 'first', user: { id: 'first' } }
  profile = null; mode = null; identityFails = false; saveFails = false; profileFails = false; holdSave = null; holdProfile = null; calls.length = 0
  holdJoin = null; malformedSave = false; joinFails = false
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  vi.stubGlobal('scrollTo', () => {})
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input), method = init?.method ?? 'GET', body = init?.body ? JSON.parse(String(init.body)) : null
    calls.push({ path, method, body })
    if (path.endsWith('/notifications')) return Response.json({ notifications: [], unreadCount: 0 })
    if (path.endsWith('/account-profile')) return identityFails ? Response.json({ code: 'unavailable', error: 'Matching RPC is not available yet.' }, { status: 503 }) : Response.json({ profile: identity })
    if (path.endsWith('/profile')) {
      if (method === 'PUT') {
        if (holdSave) await holdSave
        if (saveFails) return Response.json({ code: 'unavailable', error: 'Save unavailable.' }, { status: 503 })
        if (malformedSave) return Response.json({ profile: null })
        profile = body
      } else if (holdProfile) await holdProfile
      if (profileFails) return Response.json({ code: 'unavailable', error: 'Profile unavailable.' }, { status: 503 })
      return Response.json({ profile })
    }
    if (path.endsWith('/queue')) { expect(profile).not.toBeNull(); if (holdJoin) await holdJoin; mode = method === 'POST' ? body.mode : null; return joinFails ? Response.json({ code: 'provider', error: 'Queue outcome uncertain.' }, { status: 503 }) : Response.json({ mode }) }
    if (path.endsWith('/status')) return Response.json({ mode })
    if (path.endsWith('/result')) return Response.json({ candidate: null })
    throw new Error('Unexpected fixture request')
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })
const mount = () => render(<MemoryRouter initialEntries={['/matchmaking']}><App /></MemoryRouter>)
const button = (name: string) => screen.getByRole('button', { name, exact: true }) as HTMLButtonElement
const writes = () => calls.filter(call => call.method !== 'GET')
it('ports saved Friends setup inline with the forest full-page boundary, not the Dating deck', async () => {
  profile = structuredClone(saved); mount(); await ready()
  expect(document.querySelector('.friends-page')).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Find your people' })).toBeTruthy()
  expect(screen.getByRole('table').querySelectorAll('button')).toHaveLength(28)
  expect(screen.getByRole('button', { name: 'Music', exact: true }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByRole('link', { name: 'Dating' }).getAttribute('href')).toBe('/matchmaking?view=dating')
  expect(document.querySelector('.dating-view')).toBeNull()
  expect(writes()).toEqual([])
})
it('inline Friends drafts survive failed saves and the filter sheet cannot write profile fields', async () => {
  profile = { ...structuredClone(saved), interests: ['Coffee', 'Music', 'Art'], birthdate: '2000-01-01', location_city: 'Fixture campus' }
  mount(); await ready()
  fireEvent.click(button('Outdoors')); saveFails = true
  fireEvent.click(button('Find Friends')); await screen.findByText('Save unavailable.')
  expect(button('Outdoors').getAttribute('aria-pressed')).toBe('true')
  expect(writes().map(call => call.method)).toEqual(['PUT'])
  saveFails = false
  fireEvent.click(button('Preferences'))
  const dialog = within(screen.getByRole('dialog'))
  expect((dialog.getByRole('button', { name: 'Apply filter preview', exact: true }) as HTMLButtonElement).disabled).toBe(false)
  expect(dialog.getAllByRole('slider')).toHaveLength(3)
  expect(dialog.queryByRole('table')).toBeNull()
  expect(dialog.queryByRole('button', { name: 'Gaming', exact: true })).toBeNull()
  fireEvent.click(dialog.getByRole('button', { name: 'Close filters' }))
  expect(button('Outdoors').getAttribute('aria-pressed')).toBe('true')
  expect(writes().map(call => call.method)).toEqual(['PUT'])
})
async function ready() { await screen.findByRole('button', { name: 'Find Friends', exact: true }); await waitFor(() => expect(button('Find Friends').disabled).toBe(false)) }

it('Find Friends saves validated setup before joining active from the confirmed response, with duplicate-click guard', async () => {
  let finish!: () => void
  holdSave = new Promise(resolve => { finish = resolve })
  mount(); await ready()
  fireEvent.click(button('Music')); fireEvent.click(button('Sunday late, not available'))
  fireEvent.click(button('Find Friends')); fireEvent.submit(screen.getByRole('form', { name: 'Matching profile setup' }))
  await waitFor(() => expect(writes()).toHaveLength(1))
  expect(button('Saving…').disabled).toBe(true)
  expect(calls.some(call => call.path.endsWith('/queue'))).toBe(false)
  await act(async () => { finish(); await holdSave })
  await screen.findByRole('button', { name: 'Cancel search', exact: true })
  expect(writes().map(call => [call.method, call.path])).toEqual([['PUT', '/api/matchmaking/profile'], ['POST', '/api/matchmaking/queue']])
  expect(profile).toMatchObject({ interests: ['Music'], availability: saved.availability })
  expect(calls.some(call => call.path.endsWith('/result'))).toBe(false)
  fireEvent.click(button('Check for a match'))
  await screen.findByText(/No candidate yet/)
})

it('failed save never joins and retains the selected setup draft for deliberate retry', async () => {
  saveFails = true; mount(); await ready(); fireEvent.click(button('Music')); fireEvent.click(button('Find Friends'))
  await screen.findByText('Save unavailable.')
  expect(button('Music').getAttribute('aria-pressed')).toBe('true')
  expect(writes().map(call => call.method)).toEqual(['PUT'])
  saveFails = false; fireEvent.click(button('Find Friends'))
  await screen.findByRole('button', { name: 'Cancel search', exact: true })
  expect(writes().map(call => call.method)).toEqual(['PUT', 'PUT', 'POST'])
})

it('identity failure has a read-only retry that preserves selected preferences and exposes the actual error', async () => {
  identityFails = true
  render(<MemoryRouter><MatchingSetup token="first" busy={false} error="" save={vi.fn()} findFriends={vi.fn()} /></MemoryRouter>)
  await screen.findByRole('button', { name: 'Retry saved identity', exact: true })
  fireEvent.click(button('Music'))
  expect(button('Find Friends').disabled).toBe(true)
  expect(screen.getByText(/Matching RPC is not available yet/)).toBeTruthy()
  identityFails = false; fireEvent.click(button('Retry saved identity')); await ready()
  expect(button('Music').getAttribute('aria-pressed')).toBe('true')
  expect(writes()).toEqual([])
})

it('saved dashboard requires explicit downtime replacement consent and cancel never writes', async () => {
  profile = structuredClone(saved); mode = 'downtime'; mount(); await ready()
  fireEvent.click(button('Find Friends'))
  await screen.findByRole('dialog', { name: 'Replace downtime matching?', exact: true })
  fireEvent.click(button('Cancel')); expect(writes()).toEqual([]); expect(mode).toBe('downtime')
  fireEvent.click(button('Find Friends'))
  await screen.findByRole('dialog', { name: 'Replace downtime matching?', exact: true })
  fireEvent.click(button('Replace with active search'))
  await screen.findByRole('button', { name: 'Cancel search', exact: true })
  expect(writes()).toEqual([{ path: '/api/matchmaking/queue', method: 'POST', body: { mode: 'active' } }])
})

it('unmounting or changing session while save is pending never starts a follow-on queue request', async () => {
  let finish!: () => void
  holdSave = new Promise(resolve => { finish = resolve })
  const view = mount(); await ready(); fireEvent.click(button('Find Friends'))
  await waitFor(() => expect(writes()).toHaveLength(1))
  auth.session = { access_token: 'second', user: { id: 'second' } }
  view.rerender(<MemoryRouter initialEntries={['/matchmaking']}><App /></MemoryRouter>)
  await act(async () => { finish(); await holdSave })
  expect(calls.some(call => call.path.endsWith('/queue'))).toBe(false)
  view.unmount()
})

it('delayed saved-profile reads preselect real labels/windows, not a confirmed empty setup', async () => {
  profile = structuredClone(saved)
  let finish!: () => void
  holdProfile = new Promise(resolve => { finish = resolve })
  mount(); await screen.findByText('Loading profile…')
  expect(screen.queryByText('No matching profile saved yet.')).toBeNull()
  expect(screen.queryByText('0/30 selected')).toBeNull()
  await act(async () => { finish(); await holdProfile })
  await ready(); fireEvent.click(button('Preferences'))
  const editor = within(screen.getByRole('dialog'))
  expect(editor.getAllByRole('slider')).toHaveLength(3)
  fireEvent.click(editor.getByRole('button', { name: 'Close filters' }))
  expect(button('Music').getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByRole('table')).toBeTruthy()
  expect(writes()).toEqual([])
})

it('a profile read failure remains unavailable, never a confirmed-empty editable setup', async () => {
  profileFails = true; mount(); await screen.findByText('Profile unavailable.')
  expect(screen.queryByRole('form', { name: 'Matching profile setup' })).toBeNull()
  expect(button('Find Friends').disabled).toBe(true)
  expect(writes()).toEqual([])
})

it('a malformed save response cannot satisfy the profile prerequisite or trigger queue enrollment', async () => {
  malformedSave = true; mount(); await ready(); fireEvent.click(button('Find Friends'))
  await screen.findByRole('alert')
  expect(writes().map(call => call.method)).toEqual(['PUT'])
  expect(mode).toBeNull()
})

it('Searching is busy, guards repeated actions and reconciles an uncertain join without automatic result lookup', async () => {
  profile = structuredClone(saved); joinFails = true
  let finish!: () => void
  holdJoin = new Promise(resolve => { finish = resolve })
  mount(); await ready(); fireEvent.click(button('Find Friends'))
  await waitFor(() => expect(writes()).toHaveLength(1))
  expect(button('Searching…').disabled).toBe(true)
  fireEvent.click(button('Searching…'))
  await act(async () => { finish(); await holdJoin })
  await screen.findByRole('button', { name: 'Cancel search', exact: true })
  expect(screen.getByRole('alert').textContent).toContain('Queue outcome uncertain.')
  expect(writes()).toHaveLength(1)
  expect(calls.filter(call => call.path.endsWith('/status')).length).toBeGreaterThanOrEqual(4)
  expect(calls.some(call => call.path.endsWith('/result'))).toBe(false)
})

it('unmount during a pending save prevents any later status or queue request', async () => {
  let finish!: () => void
  holdSave = new Promise(resolve => { finish = resolve })
  const view = mount(); await ready(); fireEvent.click(button('Find Friends'))
  await waitFor(() => expect(writes()).toHaveLength(1))
  const before = calls.length
  view.unmount()
  await act(async () => { finish(); await holdSave })
  expect(calls).toHaveLength(before)
  expect(mode).toBeNull()
})

it('downtime discovered while saving still requires consent before join, with cancel preserving the saved profile', async () => {
  let finish!: () => void
  holdSave = new Promise(resolve => { finish = resolve })
  mount(); await ready(); fireEvent.click(button('Music')); fireEvent.click(button('Find Friends'))
  await waitFor(() => expect(writes()).toHaveLength(1))
  mode = 'downtime'
  await act(async () => { finish(); await holdSave })
  await screen.findByRole('dialog', { name: 'Replace downtime matching?', exact: true })
  fireEvent.click(button('Cancel'))
  expect(writes().map(call => call.method)).toEqual(['PUT'])
  expect(profile?.interests).toEqual(['Music'])
  expect(mode).toBe('downtime')
})

it('requires leaving the confirmed Friends queue before opening search filters', async () => {
  profile = structuredClone(saved); mode = 'active'
  mount(); await screen.findByRole('button', { name: 'Cancel search', exact: true })
  expect(button('Preferences').disabled).toBe(true)
  expect(button('Preferences').title).toBe('Leave your queue before changing filters')
  fireEvent.click(button('Preferences'))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(writes()).toEqual([])
})

it('keeps the normal Friends setup concise while retaining exact editing and recovery', async () => {
  profile = structuredClone(saved); mount(); await ready()
  expect(screen.queryByRole('button', { name: 'Refresh status' })).toBeNull()
  expect(screen.queryByText('On this device')).toBeNull()
  expect(screen.queryByRole('link', { name: 'Edit location and birthdate on Profile' })).toBeNull()
  expect(screen.getByText('Exact times').closest('.friends-availability')).toBeTruthy()
  expect(button('Find Friends').querySelector('svg')).not.toBeNull()
  fireEvent.click(button('Find Friends'))
  await screen.findByRole('button', { name: 'Cancel search' })
  expect(screen.queryByRole('button', { name: 'Refresh status' })).toBeNull()
  expect(screen.queryByText('On this device')).toBeNull()
  expect(screen.getByRole('button', { name: 'Check for a match' })).toBeTruthy()
})
