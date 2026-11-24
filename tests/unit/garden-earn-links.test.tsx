import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { EarnPebbles } from '../../src/features/garden/EarnPebbles'

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
afterEach(cleanup)

const social = { connectionsClaimed: 0, connectionAvailable: false, keepInTouchClaimed: false, keepInTouchAvailable: false }
const renderSheet = (close = vi.fn()) => render(<MemoryRouter><Routes>
  <Route path="/" element={<EarnPebbles rewards={{ social } as never} disabled={false} claim={async () => null} close={close} error="" refresh={() => {}} />} />
  <Route path="/messages" element={<p>Messages page</p>} />
  <Route path="/messages/requests" element={<p>Requests page</p>} />
</Routes></MemoryRouter>)

it('links the Accept a connection row to message requests and closes the sheet', () => {
  const close = vi.fn()
  renderSheet(close)
  const link = screen.getByRole('link', { name: 'Accept a connection' })
  expect(link.getAttribute('href')).toBe('/messages/requests')
  fireEvent.click(link)
  expect(close).toHaveBeenCalled()
  expect(screen.getByText('Requests page')).toBeTruthy()
})

it('links the Message a connection row to Messages', () => {
  renderSheet()
  const link = screen.getByRole('link', { name: 'Message a connection' })
  expect(link.getAttribute('href')).toBe('/messages')
  fireEvent.click(link)
  expect(screen.getByText('Messages page')).toBeTruthy()
})
