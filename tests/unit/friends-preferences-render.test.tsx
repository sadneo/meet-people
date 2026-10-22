import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter } from 'react-router'
import type { Session } from '@supabase/supabase-js'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { AccountContext } from '../../src/auth/account-context'
import { FriendsPreferences } from '../../src/features/matchmaking/FriendsPreferences'
import { accountFixture, requiredPreferences } from './complete-profile-fixture'
import { friendsPreferencesFixture, deferredFriendsResponse } from './friends-preferences-fixture'

let fixture: ReturnType<typeof friendsPreferencesFixture>
function Harness({ home }: { home: string | null }) { const [open, setOpen] = useState(false); return <><button onClick={() => setOpen(true)}>Open Friends filters</button><FriendsPreferences open={open} close={() => setOpen(false)} home={home} /></> }
function tree(owner: string | null = 'first', busy = false, home: string | null = 'Home campus') {
  const account = accountFixture({ username: 'synthetic', display_name: 'Synthetic', bio: null, avatar_url: null, ...requiredPreferences })
  account.profile!.location_city = home
  const session = owner ? { access_token: `${owner}-token`, user: { id: owner } } as Session : null
  return <AccountContext.Provider value={{ session, loaded: !!owner, account, busy, error: '', save: async () => false, reload() {} }}><MemoryRouter><Harness home={home} /></MemoryRouter></AccountContext.Provider>
}
beforeEach(() => {
  fixture = friendsPreferencesFixture()
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
async function open() { const opener = screen.getByRole('button', { name: 'Open Friends filters' }); opener.focus(); fireEvent.click(opener); await screen.findByLabelText('Maximum distance in miles'); return within(screen.getByRole('dialog')) }
const save = () => screen.getByRole('button', { name: 'Save Friends filters' })
it('shows no editable defaults before strict GET; revision zero exposes explicit unsaved defaults only when editing, never account goals or writes', async () => {
  const pending = deferredFriendsResponse(); fixture.state.onRead = () => pending.promise
  render(tree()); fireEvent.click(screen.getByRole('button', { name: 'Open Friends filters' }))
  expect(screen.queryByRole('slider')).toBeNull(); expect(save()).toHaveProperty('disabled', true)
  await act(async () => pending.resolve(Response.json({ revision: 0, preferences: null })))
  await screen.findByLabelText('Maximum distance in miles')
  expect(screen.getByText(/No Friends filter choices stored/)).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Meet new people', exact: true }).getAttribute('aria-pressed')).toBe('false')
  expect(fixture.puts()).toHaveLength(0)
  expect(screen.getByText(/Saved filters are not applied to the current queue/)).toBeTruthy()
})
it.each(['unavailable', 'malformed'])('keeps %s capability unavailable until explicit read-only retry', async kind => {
  fixture.state.onRead = async () => kind === 'unavailable' ? Response.json({ code: 'unavailable', error: 'Not installed' }, { status: 503 }) : Response.json({ revision: 1, preferences: null })
  render(tree()); fireEvent.click(screen.getByRole('button', { name: 'Open Friends filters' }))
  await screen.findByText(/Friends filters are unavailable/)
  expect(screen.queryByRole('slider')).toBeNull()
  fixture.state.onRead = null
  fireEvent.click(screen.getByRole('button', { name: 'Reload saved Friends filters' }))
  await screen.findByLabelText('Maximum distance in miles')
  expect(fixture.puts()).toHaveLength(0)
})
it('saves exact custom goals and unresolved area through PUT/GET only, retains custom choices after uncheck, and never calls profile/queue', async () => {
  render(tree()); let dialog = await open()
  fireEvent.change(dialog.getByLabelText('Custom friendship goal'), { target: { value: ' Exact custom goal 🪨 ' } })
  fireEvent.click(dialog.getByRole('button', { name: 'Add goal', exact: true }))
  fireEvent.click(dialog.getByLabelText('Temporary search area'))
  fireEvent.change(dialog.getByLabelText('Temporary city or campus'), { target: { value: ' Unresolved campus ' } })
  fireEvent.change(dialog.getByLabelText('Maximum distance in miles'), { target: { value: '80' } })
  fireEvent.click(save()); await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(fixture.state.calls.map(call => call.method)).toEqual(['GET', 'PUT', 'GET'])
  expect(fixture.puts()[0].body).toMatchObject({ expectedRevision: 0, preferences: { radiusMiles: 80, goals: [' Exact custom goal 🪨 '], searchArea: { source: 'temporary', areaLabel: ' Unresolved campus ', resolvedLocationRef: null } } })
  dialog = await open()
  const custom = dialog.getByRole('button', { name: /Exact custom goal/ })
  fireEvent.click(custom); expect(custom.getAttribute('aria-pressed')).toBe('false')
  fireEvent.click(custom); expect(custom.getAttribute('aria-pressed')).toBe('true')
})
it('holds pending save/readback locks including Escape, then closes and restores focus after GET', async () => {
  render(tree()); const dialog = await open(), response = deferredFriendsResponse()
  fixture.state.onRead = () => response.promise
  fireEvent.click(save()); await waitFor(() => expect(fixture.gets()).toHaveLength(2))
  expect(dialog.getByRole('button', { name: 'Close filters' })).toHaveProperty('disabled', true)
  expect(dialog.getByLabelText('Maximum distance in miles').closest('fieldset')).toHaveProperty('disabled', true)
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true })); expect(screen.getByRole('dialog')).toBeTruthy()
  await act(async () => response.resolve(Response.json(fixture.state.stored)))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open Friends filters' }))
})
it.each(['conflict', 'uncertain'])('retains %s drafts/gate through failed reload and close/reopen, with explicit reconciliation only', async kind => {
  render(tree()); let dialog = await open()
  fireEvent.change(dialog.getByLabelText('Maximum distance in miles'), { target: { value: '80' } })
  fixture.state.onWrite = async value => { if (kind === 'uncertain') { fixture.commit(value); throw new Error('Disconnected') }; return Response.json({ code: 'conflict', error: 'Changed' }, { status: 409 }) }
  fireEvent.click(save()); await dialog.findByRole('alert')
  expect(dialog.getByLabelText('Maximum distance in miles')).toHaveProperty('value', '80')
  expect(save()).toHaveProperty('disabled', true)
  fixture.state.onRead = async () => Response.json(null)
  fireEvent.click(dialog.getByRole('button', { name: 'Reload saved Friends filters' })); await dialog.findByText(/Friends filters are unavailable/)
  expect(dialog.getByLabelText('Maximum distance in miles')).toHaveProperty('value', '80')
  fireEvent.click(dialog.getByRole('button', { name: 'Close filters' })); dialog = await open()
  expect(save()).toHaveProperty('disabled', true)
  fixture.state.onRead = null; fixture.state.onWrite = null
  fireEvent.click(dialog.getByRole('button', { name: 'Reload saved Friends filters' }))
  await waitFor(() => expect(save()).toHaveProperty('disabled', false))
  expect(fixture.puts()).toHaveLength(1)
})
it('Cancel discards drafts; delayed reload cannot replace a reopened sheet’s edits', async () => {
  render(tree()); let dialog = await open()
  fireEvent.change(dialog.getByLabelText('Maximum distance in miles'), { target: { value: '80' } })
  fireEvent.click(dialog.getByRole('button', { name: 'Close filters' })); dialog = await open()
  expect(dialog.getByLabelText('Maximum distance in miles')).toHaveProperty('value', '15')
  const response = deferredFriendsResponse(); fixture.state.onRead = () => response.promise
  fireEvent.click(dialog.getByRole('button', { name: 'Reload saved Friends filters' }))
  fireEvent.click(dialog.getByRole('button', { name: 'Close filters' })); dialog = await open()
  fireEvent.change(dialog.getByLabelText('Maximum distance in miles'), { target: { value: '83' } })
  await act(async () => response.resolve(Response.json(fixture.state.stored)))
  expect(dialog.getByLabelText('Maximum distance in miles')).toHaveProperty('value', '83')
  expect(fixture.puts()).toHaveLength(0)
})
it.each(['Changed home', null])('latches home change to %s while closed and drops a stale home ref even after read-only reload', async home => {
  fixture.state.stored = { revision: 2, preferences: { ageMin: 18, ageMax: 35, radiusMiles: 5, goals: ['Existing custom'], searchArea: { source: 'home', resolvedLocationRef: 'a0000000-0000-4000-8000-000000000001' } } }
  const view = render(tree()); let dialog = await open()
  fireEvent.click(dialog.getByRole('button', { name: 'Close filters' }))
  view.rerender(tree('first', false, home)); dialog = await open()
  fireEvent.click(dialog.getByRole('button', { name: 'Reload saved Friends filters' }))
  await waitFor(() => expect(save()).toHaveProperty('disabled', false))
  fireEvent.click(save()); await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(fixture.puts()[0].body?.preferences.searchArea.resolvedLocationRef).toBeNull()
})
it('fences an old actor pending save without old-token readback or closing the new private sheet', async () => {
  const view = render(tree()); await open()
  const response = deferredFriendsResponse(); fixture.state.onWrite = () => response.promise
  fireEvent.click(save()); await waitFor(() => expect(fixture.puts()).toHaveLength(1))
  view.rerender(tree('second')); await screen.findByLabelText('Maximum distance in miles')
  const old = { revision: 1, preferences: fixture.puts()[0].body!.preferences }
  await act(async () => response.resolve(Response.json(old)))
  expect(screen.getByRole('dialog')).toBeTruthy()
  expect(screen.queryByText(/Friends filters saved and reloaded/)).toBeNull()
  expect(fixture.gets().filter(call => call.token === 'Bearer first-token')).toHaveLength(1)
})
it.each(['source', 'label', 'explicit-clear'])('invalidates a stored ref on %s even if the selection returns to its old text', async change => {
  fixture.state.stored = { revision: 2, preferences: { ageMin: 18, ageMax: 35, radiusMiles: 5, goals: [], searchArea: { source: 'temporary', areaLabel: 'Original campus', resolvedLocationRef: 'a0000000-0000-4000-8000-000000000001' } } }
  render(tree()); const dialog = await open()
  if (change === 'source') {
    fireEvent.click(dialog.getByLabelText(/Home area/)); fireEvent.click(dialog.getByLabelText('Temporary search area'))
    fireEvent.change(dialog.getByLabelText('Temporary city or campus'), { target: { value: 'Original campus' } })
  } else if (change === 'label') {
    fireEvent.change(dialog.getByLabelText('Temporary city or campus'), { target: { value: 'Other campus' } })
    fireEvent.change(dialog.getByLabelText('Temporary city or campus'), { target: { value: 'Original campus' } })
  } else fireEvent.click(dialog.getByRole('button', { name: 'Clear chosen location' }))
  fireEvent.click(save()); await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(fixture.puts()[0].body?.preferences.searchArea).toEqual({ source: 'temporary', areaLabel: 'Original campus', resolvedLocationRef: null })
})
it('limits exact goals to 20, permits removals and uses Enter to add rather than prematurely save', async () => {
  fixture.state.stored = { revision: 1, preferences: { ageMin: 18, ageMax: 35, radiusMiles: 15, goals: Array.from({ length: 20 }, (_, index) => `Custom ${index}`), searchArea: { source: 'home', resolvedLocationRef: null } } }
  render(tree()); const dialog = await open()
  expect(dialog.getByRole('button', { name: 'Study buddies', exact: true })).toHaveProperty('disabled', true)
  fireEvent.click(dialog.getByRole('button', { name: 'Custom 0', exact: true }))
  const input = dialog.getByLabelText('Custom friendship goal')
  fireEvent.change(input, { target: { value: ' Exact new goal ' } }); fireEvent.keyDown(input, { key: 'Enter' })
  expect(fixture.puts()).toHaveLength(0)
  fireEvent.click(save()); await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(fixture.puts()[0].body?.preferences.goals).toHaveLength(20)
  expect(fixture.puts()[0].body?.preferences.goals.at(-1)).toBe(' Exact new goal ')
})
