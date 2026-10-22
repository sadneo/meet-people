import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AccountUiPreviewProvider } from '../../src/features/account/AccountUiPreview'
import { useAccountUiPreview } from '../../src/features/account/account-ui-preview-context'
import { BlocklistPanel, SafetyActions, type BlocklistAdapter } from '../../src/features/account/SafetyControls'
import { calculatedAge, validateFacts } from '../../src/features/account/profile-rules'
import { datingTargets, emptyDatingPreferences, validateDatingPreferences } from '../../src/features/matchmaking/dating-preferences'
import { validateSearchOptions } from '../../src/features/matchmaking/search-preferences'

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })
it('validates real calendar birthdays and calculates age at the birthday boundary', () => {
  const before = new Date(2026, 9, 18), birthday = new Date(2026, 9, 19)
  expect(calculatedAge('2008-10-19', before)).toBe(17)
  expect(calculatedAge('2008-10-19', birthday)).toBe(18)
  expect(calculatedAge('2027-01-01', birthday)).toBeNull()
  expect(calculatedAge('2000-02-30', birthday)).toBeNull()
  expect(calculatedAge('2000-02-29', birthday)).toBe(26)
})
it('keeps reciprocal target inputs explicit and asks clarification instead of guessing ambiguous identities', () => {
  expect(datingTargets({ ...emptyDatingPreferences, gender: 'Man', sexuality: 'Straight' })).toEqual(['Woman'])
  expect(datingTargets({ ...emptyDatingPreferences, gender: 'Woman', sexuality: 'Straight' })).toEqual(['Man'])
  expect(datingTargets({ ...emptyDatingPreferences, gender: 'Man', sexuality: 'Gay' })).toEqual(['Man'])
  expect(datingTargets({ ...emptyDatingPreferences, gender: 'Woman', sexuality: 'Lesbian' })).toEqual(['Woman'])
  for (const sexuality of ['Asexual', 'Questioning', 'Other', 'Queer', 'Bisexual', 'Pansexual']) expect(datingTargets({ ...emptyDatingPreferences, gender: 'Nonbinary', sexuality })).toBeNull()
  expect(datingTargets({ ...emptyDatingPreferences, gender: 'Nonbinary', sexuality: 'Asexual', clarifiedTargets: ['Woman', 'Nonbinary'] })).toEqual(['Woman', 'Nonbinary'])
  expect(validateDatingPreferences({ ...emptyDatingPreferences, feet: '6', inches: '0' })).toBe('')
  expect(validateDatingPreferences({ ...emptyDatingPreferences, feet: '6', inches: '' })).toContain('both')
})
it('validates optional facts, unique languages and temporary search areas', () => {
  expect(validateFacts('', '', [])).toBe('')
  expect(validateFacts('School', 'Work', ['English', 'english'])).toContain('once')
  expect(validateFacts('', '', [''])).toContain('languages')
  expect(validateFacts('', '', ['English', '\uFEFFENGLISH\u00A0'])).toContain('once')
  expect(validateFacts('', '', ['ΟΣ', 'ος'])).toContain('once')
  expect(validateFacts('😀'.repeat(120), '', ['日本語'])).toBe('')
  expect(validateSearchOptions({ source: 'temporary', area: '', goals: [] })).toContain('temporary')
  expect(validateSearchOptions({ source: 'home', area: '', goals: [] })).toBe('')
})
it('clears unsupported preview values on actor changes and never writes storage', () => {
  const storage = vi.spyOn(Storage.prototype, 'setItem')
  function Editor() { const preview = useAccountUiPreview(); return <><p>{preview.picture || 'Empty'}</p><button onClick={() => preview.setPicture('Private picture preview')}>Edit</button></> }
  const view = render(<AccountUiPreviewProvider key="first"><Editor /></AccountUiPreviewProvider>)
  fireEvent.click(screen.getByText('Edit')); expect(screen.getByText('Private picture preview')).toBeTruthy()
  view.rerender(<AccountUiPreviewProvider key="second"><Editor /></AccountUiPreviewProvider>)
  expect(screen.getByText('Empty')).toBeTruthy(); expect(storage).not.toHaveBeenCalled()
})
it('never turns an unavailable blocklist into an empty list or a locally successful block', async () => {
  render(<><BlocklistPanel /><SafetyActions name="Person" /></>)
  expect(screen.getByRole('alert').textContent).toContain('not connected')
  expect(screen.queryByText('No blocked users in the confirmed list.')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Block or hide Person' }))
  expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Blocking unavailable' })).toHaveProperty('disabled', true)
})
it('requires confirmation and authoritative readback before removing a blocked account; keeps failure visible', async () => {
  const person = { id: 'person-1', name: 'Person One', blockedAt: '2026-10-19T00:00:00Z' }
  const adapter: BlocklistAdapter = { read: vi.fn().mockResolvedValue([person]), unblock: vi.fn().mockRejectedValue(new Error('failed')) }
  render(<BlocklistPanel adapter={adapter} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Unblock Person One' }))
  const dialog = within(screen.getByRole('dialog'))
  fireEvent.click(dialog.getByRole('button', { name: 'Confirm unblock' }))
  await waitFor(() => expect(dialog.getByRole('alert').textContent).toContain('could not be confirmed'))
  expect(screen.getByRole('button', { name: 'Unblock Person One' })).toBeTruthy()
  vi.mocked(adapter.unblock).mockResolvedValue()
  vi.mocked(adapter.read).mockResolvedValueOnce([])
  fireEvent.click(dialog.getByRole('button', { name: 'Confirm unblock' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(screen.getByText('No blocked users in the confirmed list.')).toBeTruthy()
  expect(adapter.unblock).toHaveBeenCalledTimes(2)
})
it('discards delayed blocklist reads after the authenticated adapter changes', async () => {
  let finish!: (value: { id: string; name: string; blockedAt: string }[]) => void
  const first: BlocklistAdapter = { read: () => new Promise(resolve => { finish = resolve }), unblock: vi.fn() }
  const second: BlocklistAdapter = { read: vi.fn().mockResolvedValue([]), unblock: vi.fn() }
  const view = render(<BlocklistPanel adapter={first} />)
  view.rerender(<BlocklistPanel adapter={second} />)
  await screen.findByText('No blocked users in the confirmed list.')
  finish([{ id: 'old', name: 'Old actor private list', blockedAt: '2026-10-19T00:00:00Z' }])
  await waitFor(() => expect(screen.queryByText('Old actor private list')).toBeNull())
})
it('preserves an existing custom identity until the owner explicitly replaces it', () => {
  const legacy = { ...emptyDatingPreferences, gender: 'Existing custom identity' }
  expect(validateDatingPreferences(legacy, legacy)).toBe('')
  expect(validateDatingPreferences({ ...legacy, gender: 'Injected new identity' }, legacy)).toContain('available options')
  expect(validateDatingPreferences({ ...legacy, gender: 'Other' }, legacy)).toBe('')
  expect(datingTargets({ ...legacy, sexuality: 'Straight' })).toBeNull()
})
