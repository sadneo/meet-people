import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { emptyAccount, type Account } from '../shared/account'
import { AccountContext } from '../src/auth/account-context'
import { accountToProfile } from '../src/auth/profile'
import { PrototypeContext, type PrototypeContextValue } from '../src/features/prototype/context'
import { initialState, interests } from '../src/features/prototype/model'
import { ProfileScreen } from '../src/features/prototype/Social'

vi.mock('../src/supabase', () => ({ supabase: null }))
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
afterEach(cleanup)

it('lets a saved custom interest be removed and saved alongside preset interests', async () => {
  const account: Account = { ...emptyAccount, profile: { username: 'grace', display_name: 'Grace', bio: 'Plants and yoga.', birthdate: null, location_city: null, avatar_url: null, interests: ['morning yoga', 'plant-based cooking', 'Coffee'], availability: [] } }
  const save = vi.fn<(account: Account) => Promise<boolean>>().mockResolvedValue(true)
  const prototype: PrototypeContextValue = {
    state: { ...initialState, profile: accountToProfile(account) }, dispatch: vi.fn(), scene: 'Profile', go: vi.fn(),
    empty: false, setEmpty: vi.fn(), personId: 'jamie', setPersonId: vi.fn(), eventId: 'acoustic', setEventId: vi.fn(), chatPerson: null, setChatPerson: vi.fn(),
  }
  render(<MemoryRouter><AccountContext.Provider value={{ session: { user: { id: 'grace' } } as Session, account, loaded: true, busy: false, error: '', save, reload: vi.fn() }}><PrototypeContext.Provider value={prototype}><ProfileScreen /></PrototypeContext.Provider></AccountContext.Provider></MemoryRouter>)

  fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }))
  const choices = within(screen.getByRole('group', { name: 'Edit interests' }))
  const yoga = choices.getByRole('button', { name: 'morning yoga', exact: true })
  expect(yoga.getAttribute('aria-pressed')).toBe('true')
  expect(choices.getByRole('button', { name: 'plant-based cooking', exact: true }).getAttribute('aria-pressed')).toBe('true')
  for (const preset of interests) expect(choices.getByRole('button', { name: preset, exact: true })).toBeTruthy()
  expect(choices.getByRole('button', { name: 'Coffee', exact: true }).getAttribute('aria-pressed')).toBe('true')

  fireEvent.click(yoga)
  expect(yoga.getAttribute('aria-pressed')).toBe('false')
  fireEvent.click(yoga)
  expect(yoga.getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(yoga)
  fireEvent.click(choices.getByRole('button', { name: 'Music', exact: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Save profile', exact: true }))
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ profile: expect.objectContaining({ interests: ['plant-based cooking', 'Coffee', 'Music'] }) })))
})
