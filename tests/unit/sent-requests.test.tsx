import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SentRequests } from '../../src/ui/SentRequests'

const remove = vi.hoisted(() => vi.fn())
vi.mock('../../src/features/connections/client', () => ({ connections: { remove } }))
vi.mock('../../src/ui/common', async () => ({
  ...(await vi.importActual<object>('../../src/ui/common')),
  PersonPhoto: ({ name }: { name: string }) => <span>{name} photo</span>,
}))
afterEach(() => { cleanup(); remove.mockReset() })

const sent = [{ id: '00000000-0000-4000-8000-000000000001', display_name: 'Hank Rivera', avatar_url: null, mode: 'friends' as const, requested_at: '2026-11-18T00:00:00Z' }]

it('lists sent requests and cancels one after confirming', async () => {
  remove.mockResolvedValue({ status: 'none', conversationId: null })
  const changed = vi.fn()
  render(<SentRequests sent={sent} changed={changed} />)
  expect(screen.getByText('Hank Rivera')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(remove).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }))
  expect(screen.queryByText('Hank Rivera')).toBeNull()
  await waitFor(() => expect(remove).toHaveBeenCalledWith(sent[0].id))
  await waitFor(() => expect(changed).toHaveBeenCalled())
})

it('restores the row and explains when cancelling fails', async () => {
  remove.mockRejectedValue(new Error('Offline'))
  render(<SentRequests sent={sent} changed={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }))
  expect((await screen.findByRole('alert')).textContent).toContain('Couldn’t cancel your request to Hank Rivera. Offline')
  expect(screen.getByText('Hank Rivera')).toBeTruthy()
})
