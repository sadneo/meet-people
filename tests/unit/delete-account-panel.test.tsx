import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { DeleteAccountPanel } from '../../src/features/account/DeleteAccountPanel'

const mocks = vi.hoisted(() => ({ remove: vi.fn(), signOut: vi.fn() }))
vi.mock('../../src/features/account/account-deletion-client', () => ({ deleteMyAccount: mocks.remove }))
vi.mock('../../src/supabase', () => ({ supabase: { auth: { signOut: mocks.signOut } } }))

beforeEach(() => {
  mocks.remove.mockReset().mockResolvedValue(undefined)
  mocks.signOut.mockReset().mockResolvedValue({ error: null })
})
afterEach(cleanup)

function panel() {
  const close = vi.fn()
  render(<MemoryRouter initialEntries={['/settings']}><Routes>
    <Route path="/settings" element={<DeleteAccountPanel close={close}/>}/>
    <Route path="/welcome" element={<h1>Signed out</h1>}/>
  </Routes></MemoryRouter>)
  return close
}

it('uses shared non-submit actions and requires the confirmation word before deletion', () => {
  const close = panel()
  const remove = screen.getByRole('button', { name: 'Delete my account', exact: true }) as HTMLButtonElement
  expect(remove.type).toBe('button')
  expect(remove.disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), { target: { value: 'delete' } })
  expect(remove.disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), { target: { value: 'DELETE' } })
  expect(remove.disabled).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Keep my account' }))
  expect(close).toHaveBeenCalledOnce()
  expect(mocks.remove).not.toHaveBeenCalled()
  expect(mocks.signOut).not.toHaveBeenCalled()
})

it('deletes only after confirmation, then signs out locally and navigates away', async () => {
  panel()
  fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), { target: { value: 'DELETE' } })
  fireEvent.click(screen.getByRole('button', { name: 'Delete my account', exact: true }))
  await screen.findByRole('heading', { name: 'Signed out' })
  expect(mocks.remove).toHaveBeenCalledOnce()
  expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' })
})

it('retains confirmation and session if deletion fails', async () => {
  mocks.remove.mockRejectedValue(new Error('Deletion could not be confirmed.'))
  panel()
  fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), { target: { value: 'DELETE' } })
  fireEvent.click(screen.getByRole('button', { name: 'Delete my account', exact: true }))
  expect((await screen.findByRole('alert')).textContent).toBe('Deletion could not be confirmed.')
  await waitFor(() => expect((screen.getByRole('button', { name: 'Delete my account', exact: true }) as HTMLButtonElement).disabled).toBe(false))
  expect((screen.getByLabelText('Type DELETE to confirm') as HTMLInputElement).value).toBe('DELETE')
  expect(mocks.signOut).not.toHaveBeenCalled()
})
