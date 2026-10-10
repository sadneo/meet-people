import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import App from '../src/App'
import { initialState, nextUsernameChange, reducer } from '../src/features/prototype/model'

vi.stubGlobal('scrollTo', () => {})
beforeAll(() => {
  // jsdom lacks modal dialogs; open/close is enough for these tests.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true }
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.open = false }
})
afterEach(() => { cleanup(); localStorage.clear() })

function CurrentPath() { return <span aria-label="Current path">{useLocation().pathname}</span> }
const renderSettings = (path = '/settings') => render(<MemoryRouter initialEntries={[path]}><App /><CurrentPath /></MemoryRouter>)
const openRow = (name: RegExp) => fireEvent.click(screen.getByRole('button', { name }))
const dialog = (name: string) => within(screen.getByRole('dialog', { name }))

describe('prototype settings state', () => {
  it('limits username changes to once every 30 days', () => {
    const now = Date.parse('2026-10-08T12:00:00Z')
    const changed = reducer(initialState, { type: 'username', username: 'alex_2', now })
    expect(changed.account).toMatchObject({ username: 'alex_2', usernameChangedAt: '2026-10-08T12:00:00.000Z' })
    expect(reducer(changed, { type: 'username', username: 'alex_3', now: now + 29 * 864e5 }).account.username).toBe('alex_2')
    expect(reducer(changed, { type: 'username', username: 'alex_3', now: now + 31 * 864e5 }).account.username).toBe('alex_3')
    expect(nextUsernameChange(changed.account, now)?.toISOString()).toBe('2026-11-07T12:00:00.000Z')
    expect(reducer(initialState, { type: 'username', username: 'alex' })).toBe(initialState)
  })
  it('never signs out the current session', () => {
    expect(reducer(initialState, { type: 'end-session', id: 'this-device' }).sessions).toHaveLength(3)
    expect(reducer(initialState, { type: 'end-session', id: 'phone' }).sessions.map(s => s.id)).toEqual(['this-device', 'library'])
    expect(reducer(initialState, { type: 'end-other-sessions' }).sessions.map(s => s.id)).toEqual(['this-device'])
  })
  it('resets everything when the demo account is deleted', () => {
    const used = reducer(reducer(initialState, { type: 'setting', key: 'dating', value: true }), { type: 'demo-funds' })
    const deleted = reducer(used, { type: 'delete-account' })
    expect(deleted.settings.dating).toBe(false)
    expect(deleted.community.balance).toBe(0)
  })
  it('defaults dating and downtime matching to off', () => {
    expect(initialState.settings).toMatchObject({ dating: false, downtime: false })
  })
})

describe('settings screen', () => {
  it('keeps the downtime switch in sync with downtime matchmaking', () => {
    renderSettings()
    const downtime = screen.getByRole('switch', { name: 'Downtime matching' })
    expect((downtime as HTMLInputElement).checked).toBe(false)
    fireEvent.click(downtime)
    expect(localStorage.getItem('pebble.downtime-matching')).toBe('true')
    cleanup()
    renderSettings('/downtime-matchmaking')
    expect(screen.getByRole('status').textContent).toContain('Downtime matching is on')
    fireEvent.click(screen.getByRole('button', { name: 'Pause downtime matching' }))
    expect(localStorage.getItem('pebble.downtime-matching')).toBe('false')
  })
  it('offers dating as an opt-in switch', () => {
    renderSettings()
    const dating = screen.getByRole('switch', { name: 'Open to dating' }) as HTMLInputElement
    expect(dating.checked).toBe(false)
    fireEvent.click(dating)
    expect(dating.checked).toBe(true)
  })
  it('validates usernames and shows when they can change again', () => {
    renderSettings()
    openRow(/^Username/)
    const input = dialog('Change username').getByLabelText('Username')
    fireEvent.change(input, { target: { value: 'No Spaces' } })
    fireEvent.click(dialog('Change username').getByRole('button', { name: 'Save username' }))
    expect(screen.getByRole('alert').textContent).toMatch(/3–30/)
    fireEvent.change(input, { target: { value: 'jamie' } })
    fireEvent.click(dialog('Change username').getByRole('button', { name: 'Save username' }))
    expect(screen.getByRole('alert').textContent).toBe('That username is taken.')
    fireEvent.change(input, { target: { value: 'Alex_Pebble' } })
    fireEvent.click(dialog('Change username').getByRole('button', { name: 'Save username' }))
    expect(screen.getByRole('button', { name: /^Username/ }).textContent).toContain('@alex_pebble')
    openRow(/^Username/)
    expect(dialog('Change username').getByText(/You can change it again on/)).toBeTruthy()
  })
  it('requires confirming a new email, which can be cancelled', () => {
    renderSettings()
    openRow(/^Email address/)
    const email = dialog('Email address')
    fireEvent.change(email.getByLabelText('New email'), { target: { value: 'alex@example.com' } })
    fireEvent.click(email.getByRole('button', { name: 'Send confirmation links' }))
    expect(screen.getByRole('alert').textContent).toBe('That is already your email.')
    fireEvent.change(email.getByLabelText('New email'), { target: { value: ' New@Example.com ' } })
    fireEvent.click(email.getByRole('button', { name: 'Send confirmation links' }))
    expect(screen.getByRole('status').textContent).toContain('new@example.com')
    expect(screen.getByRole('button', { name: /^Email address/ }).textContent).toContain('confirming new@example.com')
    fireEvent.click(email.getByRole('button', { name: 'Confirm in demo' }))
    expect(screen.getByRole('button', { name: /^Email address/ }).textContent).toBe('Email addressnew@example.com')
  })
  it('adds a password only when it is long enough and confirmed', () => {
    renderSettings()
    openRow(/^Password/)
    const form = dialog('Add a password')
    const save = form.getByRole('button', { name: 'Save password' }) as HTMLButtonElement
    fireEvent.change(form.getByLabelText('New password'), { target: { value: 'short' } })
    fireEvent.change(form.getByLabelText('Confirm password'), { target: { value: 'short' } })
    expect(save.disabled).toBe(true)
    fireEvent.change(form.getByLabelText('New password'), { target: { value: 'a long passphrase' } })
    fireEvent.change(form.getByLabelText('Confirm password'), { target: { value: 'a long passphrase!' } })
    expect(screen.getByRole('alert').textContent).toBe('Passwords don’t match.')
    fireEvent.change(form.getByLabelText('Confirm password'), { target: { value: 'a long passphrase' } })
    fireEvent.click(save)
    expect(screen.getByRole('status').textContent).toContain('Your password is saved')
    expect(screen.getByRole('button', { name: /^Password/ }).textContent).toContain('Password set')
  })
  it('turns on two-factor, then asks for a code before sensitive actions', () => {
    renderSettings()
    openRow(/^Two-factor authentication/)
    fireEvent.click(dialog('Two-factor authentication').getByRole('button', { name: 'Set up authenticator app' }))
    expect(screen.getByRole('img', { name: 'Sample QR code (demo)' })).toBeTruthy()
    const enable = dialog('Two-factor authentication').getByRole('button', { name: 'Turn on two-factor' }) as HTMLButtonElement
    fireEvent.change(dialog('Two-factor authentication').getByLabelText('6-digit code'), { target: { value: '12a34' } })
    expect(enable.disabled).toBe(true)
    fireEvent.change(dialog('Two-factor authentication').getByLabelText('6-digit code'), { target: { value: '123456' } })
    fireEvent.click(enable)
    expect(screen.getByRole('button', { name: /^Two-factor authentication/ }).textContent).toContain('On · authenticator app')
    fireEvent.click(dialog('Two-factor authentication').getByRole('button', { name: 'Close dialog' }))
    cleanup()

    // A fresh visit has not verified a code yet.
    renderSettings()
    expect(screen.getByRole('button', { name: /^Two-factor authentication/ }).textContent).toContain('Off')
  })
  it('gates sensitive dialogs behind a code once two-factor is on', () => {
    renderSettings()
    openRow(/^Two-factor authentication/)
    fireEvent.click(screen.getByRole('button', { name: 'Set up authenticator app' }))
    fireEvent.change(screen.getByLabelText('6-digit code'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Turn on two-factor' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
    // Setting it up verified this visit, so sensitive dialogs open directly.
    openRow(/^Where you’re signed in/)
    expect(screen.getByRole('dialog', { name: 'Where you’re signed in' })).toBeTruthy()
  })
  it('signs out other devices but never this one', () => {
    renderSettings()
    openRow(/^Where you’re signed in/)
    const sessions = dialog('Where you’re signed in')
    fireEvent.click(sessions.getByRole('button', { name: 'Sign out iPhone · Safari' }))
    expect(sessions.queryByText('iPhone · Safari')).toBeNull()
    fireEvent.click(sessions.getByRole('button', { name: 'Sign out of all other devices' }))
    expect(sessions.getByText('This device')).toBeTruthy()
    expect((sessions.getByRole('button', { name: 'No other devices' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('button', { name: /^Where you’re signed in/ }).textContent).toContain('1 device')
  })
  it('downloads the demo data as JSON', () => {
    const createObjectURL = vi.fn(() => 'blob:demo')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    renderSettings()
    openRow(/^Download my data/)
    fireEvent.click(dialog('Download your data').getByRole('button', { name: 'Download my data' }))
    expect(click).toHaveBeenCalledOnce()
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toMatch(/^pebble-data-\d{4}-\d{2}-\d{2}\.json$/)
    expect(screen.getByRole('status').textContent).toContain('Your download has started')
    click.mockRestore()
  })
  it('previews dates in the chosen language and time zone', () => {
    renderSettings()
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'en-GB' } })
    fireEvent.change(screen.getByLabelText('Time zone'), { target: { value: 'Asia/Tokyo' } })
    expect(screen.getByText(/Sun 27 Sept, 04:00/)).toBeTruthy()
  })
  it('deletes the demo account only after typing DELETE', () => {
    renderSettings()
    fireEvent.click(screen.getByRole('switch', { name: 'Open to dating' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete account', exact: true }))
    const confirm = dialog('Delete your account?')
    const remove = confirm.getByRole('button', { name: 'Delete account' }) as HTMLButtonElement
    fireEvent.change(confirm.getByLabelText('Type DELETE to confirm'), { target: { value: 'delete' } })
    expect(remove.disabled).toBe(true)
    fireEvent.change(confirm.getByLabelText('Type DELETE to confirm'), { target: { value: 'DELETE' } })
    fireEvent.click(remove)
    expect(screen.getByLabelText('Current path').textContent).toBe('/login')
  })
})
