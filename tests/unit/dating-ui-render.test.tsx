import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter } from 'react-router'
import type { Session } from '@supabase/supabase-js'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AccountContext } from '../../src/auth/account-context'
import { DatingPreferences } from '../../src/features/matchmaking/DatingPreferences'
import { accountFixture, requiredPreferences } from './complete-profile-fixture'
import { datingUiFixture, deferredDatingResponse, enabledDatingSnapshot } from './dating-ui-fixture'

let fixture: ReturnType<typeof datingUiFixture>
function Harness() {
  const [open, setOpen] = useState(false)
  return <><button onClick={() => setOpen(true)}>Open Dating preferences</button><DatingPreferences open={open} close={() => setOpen(false)} /></>
}
function tree(owner: string | null = 'first', busy = false, token = `${owner}-token`) {
  const account = accountFixture({ username: 'synthetic', display_name: 'Synthetic', bio: null, avatar_url: null, ...requiredPreferences })
  const session = owner ? { access_token: token, user: { id: owner } } as Session : null
  return <AccountContext.Provider value={{ session, loaded: !!owner, account, busy, error: '', save: async () => false, reload() {} }}><MemoryRouter><Harness /></MemoryRouter></AccountContext.Provider>
}
beforeEach(() => {
  fixture = datingUiFixture()
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
async function open() {
  const opener = screen.getByRole('button', { name: 'Open Dating preferences' }); opener.focus(); fireEvent.click(opener)
  await screen.findByLabelText('My gender')
  return within(screen.getByRole('dialog'))
}
const save = () => screen.getByRole('button', { name: 'Save disabled Dating draft' })
it('requires valid GET, never exposes fake defaults on unknown/unavailable/partial state and retries read only', async () => {
  const pending = deferredDatingResponse(); fixture.state.onRead = () => pending.promise
  render(tree()); fireEvent.click(screen.getByRole('button', { name: 'Open Dating preferences' }))
  expect(screen.queryByRole('slider')).toBeNull(); expect(save()).toHaveProperty('disabled', true)
  await act(async () => pending.resolve(Response.json({ profileRevision: 1, profile: {} })))
  await screen.findByText(/Dating preferences are unavailable/)
  expect(screen.queryByLabelText('My gender')).toBeNull()
  fixture.state.onRead = null
  fireEvent.click(screen.getByRole('button', { name: 'Reload saved Dating preferences' }))
  await screen.findByLabelText('My gender')
  expect(screen.getByLabelText('My gender')).toHaveProperty('value', '')
  expect(screen.getByLabelText('Show my height on my dating profile')).toHaveProperty('checked', false)
  expect(fixture.puts()).toHaveLength(0)
})
it('atomically saves an unresolved disabled draft with initial clarification, height zero remainder and independent bounds', async () => {
  fixture.state.stored.eligibility.adult = false
  render(tree()); const dialog = await open()
  fireEvent.change(dialog.getByLabelText('My gender'), { target: { value: 'Other' } })
  fireEvent.change(dialog.getByLabelText('My sexuality'), { target: { value: 'Queer' } })
  fireEvent.click(within(dialog.getByRole('group', { name: 'Dating matching clarification' })).getByRole('checkbox', { name: 'Man', exact: true }))
  fireEvent.change(dialog.getByLabelText('Height in feet'), { target: { value: '5' } })
  fireEvent.click(save()); expect(dialog.getByRole('alert').textContent).toContain('Choose both feet and inches')
  fireEvent.change(dialog.getByLabelText('Additional height inches'), { target: { value: '0' } })
  fireEvent.change(dialog.getByLabelText('Maximum distance in miles'), { target: { value: '42' } })
  fireEvent.click(dialog.getByLabelText('Temporary search area'))
  fireEvent.change(dialog.getByLabelText('Temporary city or campus'), { target: { value: ' Unresolved campus ' } })
  fireEvent.click(save())
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(fixture.state.calls.map(call => call.method)).toEqual(['GET', 'PUT', 'GET'])
  expect(fixture.puts()[0].body).toMatchObject({ expectedProfileRevision: 0, expectedSearchRevision: 0, profile: { heightInches: 60, enabled: false, clarifiedTargets: ['Man'] }, search: { radiusMiles: 42, searchArea: { source: 'temporary', areaLabel: ' Unresolved campus ', resolvedLocationRef: null } } })
  const reopened = await open()
  expect(reopened.getByLabelText('Additional height inches')).toHaveProperty('value', '0')
  expect(reopened.getByLabelText('Maximum distance in miles')).toHaveProperty('value', '42')
  expect(reopened.queryByRole('switch')).toBeNull()
})
it('locks cancel/Escape/controls through separate readback, then restores focus only after confirmation', async () => {
  render(tree()); const dialog = await open(), response = deferredDatingResponse()
  fixture.state.onRead = () => response.promise
  fireEvent.click(save())
  await waitFor(() => expect(fixture.gets()).toHaveLength(2))
  expect(dialog.getByRole('button', { name: 'Close filters' })).toHaveProperty('disabled', true)
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
  expect(screen.getByRole('dialog')).toBeTruthy()
  expect(dialog.getByLabelText('My gender').closest('fieldset')).toHaveProperty('disabled', true)
  expect(screen.queryByText(/Disabled Dating draft saved and reloaded/)).toBeNull()
  await act(async () => response.resolve(Response.json(fixture.state.stored)))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open Dating preferences' }))
})
it.each(['conflict', 'uncertain'])('keeps both %s drafts locked across dismissal/reopen until explicit successful reconciliation', async kind => {
  render(tree()); let dialog = await open()
  fireEvent.change(dialog.getByLabelText('My gender'), { target: { value: 'Other' } })
  fireEvent.change(dialog.getByLabelText('Maximum distance in miles'), { target: { value: '70' } })
  fixture.state.onWrite = async value => {
    if (kind === 'uncertain') { fixture.commit(value); throw new Error('Disconnected') }
    return Response.json({ code: 'conflict', error: 'Changed' }, { status: 409 })
  }
  fireEvent.click(save()); await dialog.findByRole('alert')
  expect(dialog.getByLabelText('My gender')).toHaveProperty('value', 'Other')
  expect(dialog.getByLabelText('Maximum distance in miles')).toHaveProperty('value', '70')
  expect(save()).toHaveProperty('disabled', true)
  fireEvent.click(dialog.getByRole('button', { name: 'Close filters' })); dialog = await open()
  expect(save()).toHaveProperty('disabled', true)
  fixture.state.onRead = async () => Response.json(null)
  fireEvent.click(dialog.getByRole('button', { name: 'Reload saved Dating preferences' }))
  await dialog.findByText(/Dating preferences are unavailable/)
  expect(save()).toHaveProperty('disabled', true)
  fixture.state.onRead = null; fixture.state.onWrite = null
  fireEvent.click(dialog.getByRole('button', { name: 'Reload saved Dating preferences' }))
  await waitFor(() => expect(save()).toHaveProperty('disabled', false))
  expect(fixture.puts()).toHaveLength(1)
})
it('enforces established identity clearing with guidance, then permits fresh clarification after the cleared save', async () => {
  fixture.state.stored.profileRevision = fixture.state.stored.searchRevision = 2
  fixture.state.stored.profile = { ...fixture.state.stored.profile, gender: 'Legacy label', sexuality: 'Queer', clarifiedTargets: ['Man'] }
  render(tree()); let dialog = await open()
  expect(dialog.getByLabelText('My gender')).toHaveProperty('value', 'Legacy label')
  fireEvent.change(dialog.getByLabelText('My sexuality'), { target: { value: 'Questioning' } })
  fireEvent.click(within(dialog.getByRole('group', { name: 'Dating matching clarification' })).getByRole('checkbox', { name: 'Man', exact: true }))
  fireEvent.click(save()); await dialog.findByRole('alert')
  expect(fixture.puts()).toHaveLength(0)
  fireEvent.click(dialog.getByRole('button', { name: 'Clear matching clarification' })); fireEvent.click(save())
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  dialog = await open()
  fireEvent.click(within(dialog.getByRole('group', { name: 'Dating matching clarification' })).getByRole('checkbox', { name: 'Man', exact: true }))
  fireEvent.click(save()); await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(fixture.puts()).toHaveLength(2)
})
it('Cancel discards unsaved edits, Reset keeps details, and actor replacement fences pending private drafts', async () => {
  const view = render(tree()); let dialog = await open()
  fireEvent.change(dialog.getByLabelText('My gender'), { target: { value: 'Other' } })
  fireEvent.click(dialog.getByRole('button', { name: 'Reset', exact: true }))
  expect(dialog.getByLabelText('My gender')).toHaveProperty('value', 'Other')
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true })); dialog = await open()
  expect(dialog.getByLabelText('My gender')).toHaveProperty('value', '')
  const response = deferredDatingResponse()
  fixture.state.onWrite = () => response.promise
  fireEvent.click(save()); await waitFor(() => expect(fixture.puts()).toHaveLength(1))
  view.rerender(tree('second'))
  await screen.findByLabelText('My gender')
  const old = { ...fixture.state.stored, profileRevision: 1, searchRevision: 1, search: fixture.puts()[0].body!.search }
  await act(async () => response.resolve(Response.json(old)))
  expect(screen.getByRole('dialog')).toBeTruthy()
  expect(screen.queryByText(/Disabled Dating draft saved and reloaded/)).toBeNull()
  expect(fixture.gets().filter(call => call.token === 'Bearer first-token')).toHaveLength(1)
})
it('retains custom target choices after uncheck and does not overwrite edits from a cancelled delayed reload', async () => {
  fixture.state.stored.profileRevision = fixture.state.stored.searchRevision = 1
  fixture.state.stored.profile = { ...fixture.state.stored.profile, gender: 'Legacy identity', sexuality: 'Queer', clarifiedTargets: ['Exact custom target'] }
  render(tree()); let dialog = await open()
  const custom = dialog.getByRole('checkbox', { name: 'Exact custom target', exact: true })
  fireEvent.click(custom); expect(custom).toHaveProperty('checked', false)
  fireEvent.click(custom); expect(custom).toHaveProperty('checked', true)
  const response = deferredDatingResponse(); fixture.state.onRead = () => response.promise
  fireEvent.click(dialog.getByRole('button', { name: 'Reload saved Dating preferences' }))
  fireEvent.click(dialog.getByRole('button', { name: 'Close filters' }))
  dialog = await open()
  fireEvent.change(dialog.getByLabelText('Maximum distance in miles'), { target: { value: '83' } })
  await act(async () => response.resolve(Response.json(fixture.state.stored)))
  expect(dialog.getByLabelText('Maximum distance in miles')).toHaveProperty('value', '83')
  expect(fixture.puts()).toHaveLength(0)
})
it('renders existing enabled consent read-only and cannot disable it through ordinary editing or form submission', async () => {
  fixture.state.stored = enabledDatingSnapshot()
  const before = structuredClone(fixture.state.stored)
  render(tree()); let dialog = await open()
  expect(dialog.getByText(/^This saved Dating profile has enabled consent\./)).toBeTruthy()
  expect(dialog.getByLabelText('My gender').closest('fieldset')).toHaveProperty('disabled', true)
  expect(dialog.getByLabelText('Maximum distance in miles').closest('fieldset')).toHaveProperty('disabled', true)
  expect(save()).toHaveProperty('disabled', true)
  expect(dialog.getByRole('button', { name: 'Reset', exact: true })).toHaveProperty('disabled', true)
  expect(dialog.queryByRole('switch')).toBeNull()
  fireEvent.submit(save().closest('form')!)
  fireEvent.click(dialog.getByRole('button', { name: 'Close filters' })); dialog = await open()
  fireEvent.click(dialog.getByRole('button', { name: 'Reload saved Dating preferences' }))
  await waitFor(() => expect(fixture.gets()).toHaveLength(2))
  expect(save()).toHaveProperty('disabled', true)
  expect(fixture.puts()).toHaveLength(0)
  expect(fixture.state.stored).toEqual(before)
})
