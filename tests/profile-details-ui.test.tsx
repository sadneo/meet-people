import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ProfileDetails } from '../src/features/account/ProfileDetails'
import { AccountUiPreviewProvider } from '../src/features/account/AccountUiPreview'
import { AccountContext } from '../src/auth/account-context'
import { accountFixture, requiredPreferences } from './complete-profile-fixture'
import type { ProfileDetails as Details } from '../shared/profile-details'

const facts = { education: 'Original school', occupation: 'Work', languages: ['English'], visibility: { education: true, occupation: false, languages: true } }
let saved: Details, onRead: (() => Promise<Response>) | null, onWrite: (() => Promise<Response>) | null
const calls: { method: string; token: string | null; body: unknown }[] = []
const identity = { username: 'synthetic', display_name: 'Owner', bio: null, avatar_url: null }
function tree(actor: string | null = 'first', accessToken = `${actor}-token`) {
  const session = actor ? { access_token: accessToken, user: { id: actor } } as Session : null
  return <AccountContext.Provider value={{ session, loaded: !!actor, account: accountFixture({ ...identity, ...requiredPreferences }), busy: false, error: '', save: async () => false, reload() {} }}><AccountUiPreviewProvider><ProfileDetails name={actor ?? 'Signed out'} bio={null} city={null} age={20} picture={null} /></AccountUiPreviewProvider></AccountContext.Provider>
}
function deferred() { let resolve!: (response: Response) => void; return { promise: new Promise<Response>(done => { resolve = done }), resolve: (response: Response) => resolve(response) } }
beforeEach(() => {
  saved = { revision: 4, facts: structuredClone(facts) }; onRead = null; onWrite = null; calls.length = 0
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) !== '/api/matchmaking/profile-details') throw new Error('Unexpected network request')
    const method = init?.method ?? 'GET', body = init?.body ? JSON.parse(String(init.body)) : null
    calls.push({ method, body, token: new Headers(init?.headers).get('Authorization') })
    if (method === 'GET') return onRead ? onRead() : Response.json(saved)
    if (onWrite) return onWrite()
    if (body.expectedRevision !== saved.revision) return Response.json({ code: 'conflict', error: 'Changed.' }, { status: 409 })
    saved = { revision: saved.revision + 1, facts: body.facts }
    return Response.json(saved)
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
async function edit() {
  const opener = await screen.findByRole('button', { name: 'Edit details', exact: true })
  await waitFor(() => expect(opener).toHaveProperty('disabled', false))
  opener.focus(); fireEvent.click(opener)
  return within(screen.getByRole('dialog', { name: 'Education, work & languages' }))
}
it('requires capability read, saves values/visibility together, and waits for GET readback before success', async () => {
  render(tree())
  const editor = await edit()
  fireEvent.change(editor.getByLabelText('Education', { exact: true }), { target: { value: ' Saved school ' } })
  fireEvent.click(editor.getByLabelText('Show my occupation on my profile'))
  const readback = deferred(); onRead = () => readback.promise
  fireEvent.click(editor.getByRole('button', { name: 'Save details', exact: true }))
  await waitFor(() => expect(calls.filter(call => call.method === 'PUT')).toHaveLength(1))
  expect(screen.getByRole('dialog')).toBeTruthy()
  expect(editor.getByRole('button', { name: 'Cancel', exact: true })).toHaveProperty('disabled', true)
  expect(calls.find(call => call.method === 'PUT')?.body).toEqual({ expectedRevision: 4, facts: { ...facts, education: ' Saved school ', visibility: { ...facts.visibility, occupation: true } } })
  await act(async () => readback.resolve(Response.json(saved)))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(screen.getByRole('button', { name: 'Edit details', exact: true })).toBe(document.activeElement)
  expect(calls.map(call => call.method)).toEqual(['GET', 'PUT', 'GET'])
})
it('keeps deployment unavailable rather than inventing empty facts or preview saves; retry only reads', async () => {
  onRead = async () => Response.json({ code: 'unavailable', error: 'Not installed.' }, { status: 503 })
  render(tree())
  await screen.findByText(/Optional profile details are unavailable/)
  expect(screen.getByRole('button', { name: 'Edit details', exact: true })).toHaveProperty('disabled', true)
  expect(screen.queryByText('Not added yet')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Apply preview' })).toBeNull()
  onRead = null
  fireEvent.click(screen.getByRole('button', { name: 'Reload saved details', exact: true }))
  await edit()
  expect(calls.every(call => call.method === 'GET')).toBe(true)
})
it('keeps draft after conflict; explicit reload replaces it and adopts the authoritative revision', async () => {
  render(tree()); const editor = await edit()
  fireEvent.change(editor.getByLabelText('Education', { exact: true }), { target: { value: 'My draft' } })
  saved = { revision: 5, facts: { ...facts, education: 'Other tab' } }
  fireEvent.click(editor.getByRole('button', { name: 'Save details', exact: true }))
  await editor.findByText(/changed.*Reload/i)
  expect(editor.getByLabelText('Education', { exact: true })).toHaveProperty('value', 'My draft')
  expect(editor.getByRole('button', { name: 'Save details', exact: true })).toHaveProperty('disabled', true)
  expect(calls.filter(call => call.method === 'PUT')).toHaveLength(1)
  fireEvent.click(editor.getByRole('button', { name: 'Reload saved details', exact: true }))
  await waitFor(() => expect(editor.getByLabelText('Education', { exact: true })).toHaveProperty('value', 'Other tab'))
  fireEvent.change(editor.getByLabelText('Occupation', { exact: true }), { target: { value: 'New work' } })
  fireEvent.click(editor.getByRole('button', { name: 'Save details', exact: true }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(calls.filter(call => call.method === 'PUT')[1].body).toMatchObject({ expectedRevision: 5 })
})
it('keeps uncertain writes locked until authoritative reload and never silently resubmits', async () => {
  render(tree()); const editor = await edit()
  onWrite = async () => { saved = { revision: 5, facts: { ...facts, education: 'Committed despite disconnect' } }; throw new TypeError('Disconnected') }
  fireEvent.change(editor.getByLabelText('Education', { exact: true }), { target: { value: 'Committed despite disconnect' } })
  fireEvent.click(editor.getByRole('button', { name: 'Save details', exact: true }))
  await editor.findByText(/could not be confirmed/)
  expect(editor.getByRole('button', { name: 'Save details', exact: true })).toHaveProperty('disabled', true)
  fireEvent.click(editor.getByRole('button', { name: 'Reload saved details', exact: true }))
  await waitFor(() => expect(editor.getByRole('button', { name: 'Save details', exact: true })).toHaveProperty('disabled', false))
  expect(editor.getByLabelText('Education', { exact: true })).toHaveProperty('value', 'Committed despite disconnect')
  expect(calls.filter(call => call.method === 'PUT')).toHaveLength(1)
})
it('keeps the draft and save lock when explicit reconciliation fails', async () => {
  render(tree()); const editor = await edit()
  onWrite = async () => { saved = { revision: 5, facts: { ...facts, education: 'Held draft' } }; throw new TypeError('Disconnected') }
  fireEvent.change(editor.getByLabelText('Education', { exact: true }), { target: { value: 'Held draft' } })
  fireEvent.click(editor.getByRole('button', { name: 'Save details', exact: true }))
  await editor.findByText(/could not be confirmed/)
  onRead = async () => Response.json({ code: 'unavailable', error: 'Read failed.' }, { status: 503 })
  fireEvent.click(editor.getByRole('button', { name: 'Reload saved details', exact: true }))
  await editor.findByText(/Optional profile details are unavailable/)
  expect(editor.getByLabelText('Education', { exact: true })).toHaveProperty('value', 'Held draft')
  expect(editor.getByRole('button', { name: 'Save details', exact: true })).toHaveProperty('disabled', true)
  expect(calls.filter(call => call.method === 'PUT')).toHaveLength(1)
  onRead = null
  fireEvent.click(editor.getByRole('button', { name: 'Reload saved details', exact: true }))
  await waitFor(() => expect(editor.getByRole('button', { name: 'Save details', exact: true })).toHaveProperty('disabled', false))
  expect(editor.getByLabelText('Education', { exact: true })).toHaveProperty('value', 'Held draft')
  expect(calls.filter(call => call.method === 'PUT')).toHaveLength(1)
})
it.each(['Cancel', 'native cancel'])('keeps deferred reload read-only and restores focus after %s', async dismissal => {
  render(tree()); const editor = await edit()
  fireEvent.change(editor.getByLabelText('Education', { exact: true }), { target: { value: 'Discarded draft' } })
  const readback = deferred(); onRead = () => readback.promise
  fireEvent.click(editor.getByRole('button', { name: 'Reload saved details', exact: true }))
  expect(editor.getByRole('group', { name: 'Optional profile facts' })).toHaveProperty('disabled', true)
  expect(editor.getByRole('button', { name: 'Save details', exact: true })).toHaveProperty('disabled', true)
  if (dismissal === 'Cancel') fireEvent.click(editor.getByRole('button', { name: 'Cancel', exact: true }))
  else fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true, bubbles: true }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Edit details', exact: true }))
  saved = { revision: 5, facts: { ...facts, education: 'Reloaded canonical' } }
  await act(async () => readback.resolve(Response.json(saved)))
  await screen.findByText('Reloaded canonical')
  expect(screen.queryByText('Discarded draft')).toBeNull()
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(calls.map(call => call.method)).toEqual(['GET', 'GET'])
})
it.each(['unavailable', 'different'])('does not report success when accepted PUT readback is %s', async kind => {
  render(tree()); const editor = await edit()
  fireEvent.change(editor.getByLabelText('Education', { exact: true }), { target: { value: 'Kept draft' } })
  onRead = async () => kind === 'unavailable'
    ? Response.json({ code: 'unavailable', error: 'Read failed.' }, { status: 503 })
    : Response.json({ ...saved, facts: { ...saved.facts, education: 'Unexpected readback' } })
  fireEvent.click(editor.getByRole('button', { name: 'Save details', exact: true }))
  await editor.findByText(/could not be confirmed/)
  expect(editor.getByLabelText('Education', { exact: true })).toHaveProperty('value', 'Kept draft')
  expect(editor.getByRole('button', { name: 'Save details', exact: true })).toHaveProperty('disabled', true)
  expect(screen.queryByText('Profile details saved and reloaded.')).toBeNull()
  onRead = null
  fireEvent.click(editor.getByRole('button', { name: 'Reload saved details', exact: true }))
  await waitFor(() => expect(editor.getByRole('button', { name: 'Save details', exact: true })).toHaveProperty('disabled', false))
  expect(calls.filter(call => call.method === 'PUT')).toHaveLength(1)
})
it('fences a delayed initial read when the actor changes', async () => {
  const read = deferred(); onRead = () => read.promise
  const view = render(tree())
  await waitFor(() => expect(calls).toHaveLength(1))
  onRead = null; saved = { revision: 1, facts: { ...facts, education: 'Second canonical facts' } }
  view.rerender(tree('second'))
  await screen.findByText('Second canonical facts')
  await act(async () => read.resolve(Response.json({ revision: 4, facts: { ...facts, education: 'First private facts' } })))
  expect(screen.queryByText('First private facts')).toBeNull()
  expect(screen.queryByRole('alert')).toBeNull()
})
it('discards late saves and drafts on actor change without following them with an old-actor GET', async () => {
  const view = render(tree()); const editor = await edit()
  const write = deferred(); onWrite = () => write.promise
  fireEvent.change(editor.getByLabelText('Education', { exact: true }), { target: { value: 'First private draft' } })
  fireEvent.click(editor.getByRole('button', { name: 'Save details', exact: true }))
  await waitFor(() => expect(calls.filter(call => call.method === 'PUT')).toHaveLength(1))
  saved = { revision: 1, facts: { ...facts, education: 'Second owner' } }
  view.rerender(tree('second'))
  await screen.findByText('Second owner')
  await act(async () => write.resolve(Response.json({ revision: 5, facts: { ...facts, education: 'First private draft' } })))
  expect(screen.queryByText('First private draft')).toBeNull()
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(calls.filter(call => call.method === 'GET' && call.token === 'Bearer first-token')).toHaveLength(1)
  view.rerender(tree(null))
  expect(screen.queryByText('Second owner')).toBeNull()
})
it('requires explicit reconciliation after a same-owner token change interrupts a save', async () => {
  const view = render(tree()); const editor = await edit()
  const write = deferred(); onWrite = () => write.promise
  fireEvent.change(editor.getByLabelText('Education', { exact: true }), { target: { value: 'Interrupted draft' } })
  fireEvent.click(editor.getByRole('button', { name: 'Save details', exact: true }))
  await waitFor(() => expect(calls.filter(call => call.method === 'PUT')).toHaveLength(1))
  view.rerender(tree('first', 'renewed-token'))
  await editor.findByText(/Session changed while saving/)
  expect(editor.getByLabelText('Education', { exact: true })).toHaveProperty('value', 'Interrupted draft')
  expect(editor.getByRole('button', { name: 'Save details', exact: true })).toHaveProperty('disabled', true)
  expect(calls.filter(call => call.method === 'GET')).toHaveLength(1)
  saved = { revision: 5, facts: { ...facts, education: 'Interrupted draft' } }
  await act(async () => write.resolve(Response.json(saved)))
  fireEvent.click(editor.getByRole('button', { name: 'Reload saved details', exact: true }))
  await waitFor(() => expect(editor.getByRole('button', { name: 'Save details', exact: true })).toHaveProperty('disabled', false))
  expect(calls.filter(call => call.method === 'GET').at(-1)?.token).toBe('Bearer renewed-token')
  expect(calls.filter(call => call.method === 'PUT')).toHaveLength(1)
})
it('keeps the public viewer explicitly local with visible saved facts only and no public request', async () => {
  render(tree()); await edit()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Preview public profile', exact: true }))
  const viewer = within(screen.getByRole('dialog', { name: 'Public profile preview' }))
  expect(viewer.getByText('Original school')).toBeTruthy()
  expect(viewer.queryByText('Work')).toBeNull()
  expect(viewer.getByText(/does not change discovery or confirm what a live service shares/)).toBeTruthy()
  expect(calls.map(call => call.method)).toEqual(['GET'])
})
it('preserves field focus, uses shared duplicate keys, and Cancel discards drafts without writes', async () => {
  render(tree()); const editor = await edit()
  const input = editor.getByLabelText('Education', { exact: true }); input.focus()
  fireEvent.change(input, { target: { value: 'Cancel me' } }); expect(document.activeElement).toBe(input)
  fireEvent.change(editor.getByLabelText('Languages', { exact: true }), { target: { value: '\uFEFFENGLISH\u00A0' } })
  fireEvent.click(editor.getByRole('button', { name: 'Add language', exact: true }))
  await editor.findByText(/once/)
  fireEvent.click(editor.getByRole('button', { name: 'Cancel', exact: true }))
  expect(screen.queryByText('Cancel me')).toBeNull()
  expect(calls.every(call => call.method === 'GET')).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Profile picture', exact: true }))
  expect(screen.getByRole('dialog').textContent).toContain('Preview only; nothing is uploaded.')
})
