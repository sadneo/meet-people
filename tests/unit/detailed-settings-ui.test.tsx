import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SettingsDetails } from '../../src/features/account/SettingsDetails'
import { AccountContext } from '../../src/auth/account-context'
import { accountFixture, requiredPreferences } from './complete-profile-fixture'
import { detailedSettingsFixture, deferredSettingsResponse } from './detailed-settings-fixture'
import { emptyDetailedSettings, effectiveDetailedSettings } from '../../shared/detailed-settings'

let fixture: ReturnType<typeof detailedSettingsFixture>
function tree(owner: string | null = 'first', notifications = true, discovery = true, busy = false) {
  const account = accountFixture({ username: 'synthetic', display_name: 'Owner', bio: null, avatar_url: null, ...requiredPreferences })
  account.settings = { ...account.settings, notifications, discoverable: discovery }
  const session = owner ? { access_token: `${owner}-token`, user: { id: owner } } as Session : null
  return <AccountContext.Provider value={{ session, loaded: !!owner, account, busy, error: '', save: async () => false, reload() {} }}><SettingsDetails notificationsEnabled={notifications} discoveryEnabled={discovery} /></AccountContext.Provider>
}
beforeEach(() => { fixture = detailedSettingsFixture() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
function open() {
  const summary = screen.getByText('Notification & discovery details', { exact: true })
  fireEvent.click(summary)
  summary.closest('details')!.open = true
  return within(screen.getByRole('region', { name: 'Detailed notification and discovery preferences' }))
}
async function ready() {
  const region = open()
  await region.findByRole('checkbox', { name: 'New messages', exact: true })
  return region
}
it('requires GET capability and uses all-off server state, never implicitly saving old preview defaults', async () => {
  const read = deferredSettingsResponse(); fixture.state.onRead = () => read.promise
  render(tree()); const region = open()
  expect(region.queryByRole('checkbox')).toBeNull()
  expect(fixture.puts()).toEqual([])
  await act(async () => read.resolve(Response.json(fixture.snapshot())))
  const boxes = region.getAllByRole('checkbox') as HTMLInputElement[]
  expect(boxes).toHaveLength(5); expect(boxes.every(box => !box.checked)).toBe(true)
  expect(region.getByRole('button', { name: 'Save detailed preferences' })).toHaveProperty('disabled', true)
  expect(region.queryByRole('button', { name: 'Apply details preview' })).toBeNull()
  expect(region.getByText(/do not verify delivery or live discovery/)).toBeTruthy()
  expect(fixture.puts()).toEqual([])
})
it('keeps unavailable backend unavailable rather than rendering editable fake defaults', async () => {
  fixture.state.onRead = async () => Response.json({ code: 'unavailable', error: 'Missing backend.' }, { status: 503 })
  render(tree()); const region = open()
  await region.findByText(/Detailed preferences are unavailable/)
  expect(region.queryByRole('checkbox')).toBeNull()
  expect(region.queryByRole('button', { name: 'Save detailed preferences' })).toBeNull()
  fixture.state.onRead = null
  fireEvent.click(region.getByRole('button', { name: 'Reload saved preferences' }))
  await region.findByRole('checkbox', { name: 'New messages', exact: true })
  expect(fixture.puts()).toEqual([])
})
it('locks pending controls through separate canonical GET and reports success only after readback', async () => {
  render(tree()); const region = await ready()
  const input = region.getByRole('checkbox', { name: 'New messages', exact: true }); input.focus()
  fireEvent.click(input); expect(document.activeElement).toBe(input)
  const read = deferredSettingsResponse(); fixture.state.onRead = () => read.promise
  fireEvent.click(region.getByRole('button', { name: 'Save detailed preferences' }))
  await waitFor(() => expect(fixture.puts()).toHaveLength(1))
  expect(region.getByRole('button', { name: 'Cancel detail changes' })).toHaveProperty('disabled', true)
  expect(region.getByRole('button', { name: 'Reload saved preferences' })).toHaveProperty('disabled', true)
  expect(region.queryByText('Detailed preferences saved and reloaded.')).toBeNull()
  fireEvent.click(region.getByText('Notification & discovery details', { exact: true }))
  expect(region.getByText('Notification & discovery details').closest('details')!.open).toBe(true)
  await act(async () => read.resolve(Response.json(fixture.snapshot())))
  await region.findByText('Detailed preferences saved and reloaded.')
  expect(fixture.state.calls.map(call => call.method)).toEqual(['GET', 'PUT', 'GET'])
  expect(fixture.puts()[0].body).toEqual({ expectedRevision: 0, settings: { ...emptyDetailedSettings(), messages: true } })
})
it('keeps conflict drafts/save lock after failed reconciliation, then adopts explicit authoritative reload', async () => {
  render(tree()); const region = await ready()
  fireEvent.click(region.getByRole('checkbox', { name: 'New messages', exact: true }))
  fixture.state.stored = { revision: 1, settings: { ...emptyDetailedSettings(), plans: true } }
  fireEvent.click(region.getByRole('button', { name: 'Save detailed preferences' }))
  await region.findByText(/changed.*Reload/i)
  fixture.state.onRead = async () => Response.json({ code: 'unavailable', error: 'Failed reload.' }, { status: 503 })
  fireEvent.click(region.getByRole('button', { name: 'Reload saved preferences' }))
  await region.findByText(/Detailed preferences are unavailable/)
  expect(region.getByRole('checkbox', { name: 'New messages', exact: true })).toHaveProperty('checked', true)
  expect(region.getByRole('button', { name: 'Save detailed preferences' })).toHaveProperty('disabled', true)
  expect(fixture.puts()).toHaveLength(1)
  fixture.state.onRead = null
  fireEvent.click(region.getByRole('button', { name: 'Reload saved preferences' }))
  await waitFor(() => expect(region.getByRole('checkbox', { name: 'New messages', exact: true })).toHaveProperty('checked', false))
  expect(region.getByRole('checkbox', { name: 'Plan invitations and changes', exact: true })).toHaveProperty('checked', true)
  expect(fixture.puts()).toHaveLength(1)
})
it('suppresses checked raw choices under off/unknown masters without claiming delivery or discovery enforcement', async () => {
  fixture.state.stored = { revision: 1, settings: { ...emptyDetailedSettings(), messages: true, friendsDiscovery: true } }
  fixture.state.masters = null
  const view = render(tree()); const region = await ready()
  expect(region.getByRole('checkbox', { name: 'New messages', exact: true })).toHaveProperty('checked', true)
  expect(region.getByRole('checkbox', { name: 'New messages', exact: true })).toHaveProperty('disabled', true)
  await region.findByText(/Persisted global controls are unavailable/)
  fixture.state.masters = { notifications: false, discoverable: false }
  view.rerender(tree('first', false, false))
  await waitFor(() => expect(fixture.gets()).toHaveLength(2))
  expect(region.getByRole('checkbox', { name: 'Friends discovery preference' })).toHaveProperty('disabled', true)
  expect(fixture.puts()).toEqual([])
})
it('never reports accepted PUT as saved when GET readback fails, and reconciles by read only', async () => {
  render(tree()); const region = await ready()
  fireEvent.click(region.getByRole('checkbox', { name: 'New messages', exact: true }))
  fixture.state.onRead = async () => Response.json({ code: 'unavailable', error: 'Readback failed.' }, { status: 503 })
  fireEvent.click(region.getByRole('button', { name: 'Save detailed preferences' }))
  await region.findByText(/save could not be confirmed/)
  expect(region.getByRole('checkbox', { name: 'New messages', exact: true })).toHaveProperty('checked', true)
  expect(region.getByRole('button', { name: 'Save detailed preferences' })).toHaveProperty('disabled', true)
  expect(region.queryByText('Detailed preferences saved and reloaded.')).toBeNull()
  fixture.state.onRead = null
  fireEvent.click(region.getByRole('button', { name: 'Reload saved preferences' }))
  await region.findByText('Saved preferences reloaded. Review them before editing.')
  expect(fixture.puts()).toHaveLength(1)
})
it('refreshes master policy without replacing a dirty draft with another tab’s choices', async () => {
  const view = render(tree()); const region = await ready()
  fireEvent.click(region.getByRole('checkbox', { name: 'New messages', exact: true }))
  fixture.state.stored = { revision: 1, settings: { ...emptyDetailedSettings(), plans: true } }
  fixture.state.masters = { notifications: false, discoverable: true }
  view.rerender(tree('first', false, true))
  await region.findByText('Saved preferences changed. Reload saved preferences to replace this draft before saving.')
  expect(region.getByRole('checkbox', { name: 'New messages', exact: true })).toHaveProperty('checked', true)
  expect(region.getByRole('checkbox', { name: 'Plan invitations and changes', exact: true })).toHaveProperty('checked', false)
  expect(region.getByRole('button', { name: 'Save detailed preferences' })).toHaveProperty('disabled', true)
  expect(fixture.puts()).toEqual([])
})
it('Cancel discards drafts without saving and late explicit reload cannot replace subsequent edits', async () => {
  render(tree()); const region = await ready()
  fireEvent.click(region.getByRole('checkbox', { name: 'New messages', exact: true }))
  const read = deferredSettingsResponse(); fixture.state.onRead = () => read.promise
  fireEvent.click(region.getByRole('button', { name: 'Reload saved preferences' }))
  const cancel = region.getByRole('button', { name: 'Cancel detail changes' }); cancel.focus(); fireEvent.click(cancel)
  expect(document.activeElement).toBe(cancel)
  expect(region.getByRole('checkbox', { name: 'New messages', exact: true })).toHaveProperty('checked', false)
  fireEvent.click(region.getByRole('checkbox', { name: 'Match updates', exact: true }))
  fixture.state.stored = { revision: 1, settings: { ...emptyDetailedSettings(), plans: true } }
  await act(async () => read.resolve(Response.json(fixture.snapshot())))
  expect(region.getByRole('checkbox', { name: 'Match updates', exact: true })).toHaveProperty('checked', true)
  expect(region.getByRole('checkbox', { name: 'Plan invitations and changes', exact: true })).toHaveProperty('checked', false)
  expect(fixture.puts()).toEqual([])
})
it('discards old-actor pending saves/drafts without old-token readback or fake success', async () => {
  const view = render(tree()); const region = await ready(), write = deferredSettingsResponse()
  fireEvent.click(region.getByRole('checkbox', { name: 'New messages', exact: true }))
  fixture.state.onWrite = () => write.promise
  fireEvent.click(region.getByRole('button', { name: 'Save detailed preferences' }))
  await waitFor(() => expect(fixture.puts()).toHaveLength(1))
  fixture.state.stored = { revision: 0, settings: emptyDetailedSettings() }
  view.rerender(tree('second'))
  const next = open()
  await next.findByRole('checkbox', { name: 'New messages', exact: true })
  const settings = { ...emptyDetailedSettings(), messages: true }
  await act(async () => write.resolve(Response.json({ revision: 1, settings, masters: fixture.state.masters, effective: effectiveDetailedSettings(settings, fixture.state.masters) })))
  expect(next.getByRole('checkbox', { name: 'New messages', exact: true })).toHaveProperty('checked', false)
  expect(next.queryByText('Detailed preferences saved and reloaded.')).toBeNull()
  expect(fixture.gets().filter(call => call.token === 'Bearer first-token')).toHaveLength(1)
  view.rerender(tree(null))
  expect(screen.queryByRole('checkbox')).toBeNull()
})
it('re-reads authoritative masters off and on without saving choices or discarding a dirty draft', async () => {
  const view = render(tree()); const region = await ready()
  fireEvent.click(region.getByRole('checkbox', { name: 'New messages', exact: true }))
  for (const notifications of [false, true]) {
    const reads = fixture.gets().length, response = deferredSettingsResponse()
    fixture.state.masters = { notifications, discoverable: true }
    fixture.state.onRead = () => response.promise
    view.rerender(tree('first', notifications, true))
    await waitFor(() => expect(fixture.gets()).toHaveLength(reads + 1))
    expect(region.getByRole('button', { name: 'Save detailed preferences' })).toHaveProperty('disabled', true)
    await act(async () => response.resolve(Response.json(fixture.snapshot())))
    await waitFor(() => expect(region.getByRole('checkbox', { name: 'New messages', exact: true })).toHaveProperty('disabled', !notifications))
    expect(region.getByRole('checkbox', { name: 'New messages', exact: true })).toHaveProperty('checked', true)
  }
  expect(fixture.puts()).toHaveLength(0)
})
it('defers global invalidation through a pending save then reads again instead of trusting pre-master readback', async () => {
  const view = render(tree()); const region = await ready()
  const oldReadback = deferredSettingsResponse()
  fixture.state.onRead = () => oldReadback.promise
  fireEvent.click(region.getByRole('checkbox', { name: 'New messages', exact: true }))
  fireEvent.click(region.getByRole('button', { name: 'Save detailed preferences' }))
  await waitFor(() => expect(fixture.gets()).toHaveLength(2))
  const oldSnapshot = fixture.snapshot()
  view.rerender(tree('first', true, true, true))
  fixture.state.masters = { notifications: false, discoverable: true }
  view.rerender(tree('first', false, true))
  expect(fixture.gets()).toHaveLength(2)
  fixture.state.onRead = null
  await act(async () => oldReadback.resolve(Response.json(oldSnapshot)))
  await waitFor(() => expect(fixture.gets()).toHaveLength(3))
  await region.findByText(/Notification preferences are suppressed/)
  expect(region.getByRole('checkbox', { name: 'New messages', exact: true })).toHaveProperty('checked', true)
  expect(region.getByRole('checkbox', { name: 'New messages', exact: true })).toHaveProperty('disabled', true)
  expect(fixture.puts()).toHaveLength(1)
})
it('does not lose off/on master invalidation when a pending save captured the intermediate off state', async () => {
  const view = render(tree()); const region = await ready(), response = deferredSettingsResponse()
  fireEvent.click(region.getByRole('checkbox', { name: 'New messages', exact: true }))
  fixture.state.onRead = () => response.promise
  fireEvent.click(region.getByRole('button', { name: 'Save detailed preferences' }))
  await waitFor(() => expect(fixture.gets()).toHaveLength(2))
  fixture.state.masters = { notifications: false, discoverable: true }
  view.rerender(tree('first', false, true))
  const intermediate = fixture.snapshot()
  fixture.state.masters = { notifications: true, discoverable: true }
  view.rerender(tree('first', true, true))
  fixture.state.onRead = null
  await act(async () => response.resolve(Response.json(intermediate)))
  await waitFor(() => expect(fixture.gets()).toHaveLength(3))
  await waitFor(() => expect(region.getByRole('checkbox', { name: 'New messages', exact: true })).toHaveProperty('disabled', false))
  expect(region.getByRole('checkbox', { name: 'New messages', exact: true })).toHaveProperty('checked', true)
  expect(fixture.puts()).toHaveLength(1)
})
