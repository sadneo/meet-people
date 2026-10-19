// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { BlocklistPanel } from '../src/features/account/SafetyControls'

afterEach(() => { cleanup(); vi.restoreAllMocks() })
it('renders opaque targets and unknown dates honestly, without fabricated names or dates', async () => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  const id = 'a0000000-0000-4000-8000-000000000002'
  const view = render(<BlocklistPanel adapter={{ read: async () => [{ id, name: null, blockedAt: null }], unblock: async () => { throw new Error('No mutation in render fixture') } }} />)
  await screen.findByText(`Account ${id}`, { exact: true })
  expect(screen.getByText('Block date unavailable.')).toBeTruthy()
  expect(view.container.querySelector('time')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: `Unblock Account ${id}`, exact: true }))
  expect(screen.getByRole('dialog', { name: `Unblock Account ${id}?`, exact: true })).toBeTruthy()
})
it('keeps production safety unavailable without an authoritative adapter', () => {
  render(<BlocklistPanel />)
  expect(screen.getByRole('alert').textContent).toContain('not connected')
  expect(screen.queryByText('No blocked users in the confirmed list.')).toBeNull()
})
