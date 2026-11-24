import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { EventGroup } from '../../src/mobile/EventGroup'
import { MatchmakingClientError } from '../../src/features/matchmaking/client'

const mocks = vi.hoisted(() => ({ leave: vi.fn() }))
const members = [{ id: 'a', name: 'Dave', avatar: null }, { id: 'b', name: 'Iris', avatar: null }]
vi.mock('../../src/supabase', () => ({ supabase: null }))
vi.mock('../../src/ui/current', () => ({ useCurrent: () => ({ session: { access_token: 't' }, account: null }) }))
vi.mock('../../src/ui/useMatchingSetupStatus', () => ({ useMatchingSetupStatus: () => ({ value: null, loading: false, error: '', reload: vi.fn() }) }))
vi.mock('../../src/features/matchmaking/client', async (original) => ({
  ...(await original<typeof import('../../src/features/matchmaking/client')>()),
  matchmakingClient: () => ({ groupQueue: async () => ({ state: 'proposal', proposal: { members } }), groupLeave: mocks.leave }),
}))
vi.mock('../../src/ui/common', async (original) => ({
  ...(await original<typeof import('../../src/ui/common')>()),
  PersonPhoto: ({ name }: { name: string }) => <span>{name}</span>,
}))
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', '') }
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open') }
afterEach(() => { cleanup(); mocks.leave.mockReset() })

it('asks before leaving a suggested group', async () => {
  mocks.leave.mockResolvedValue({ state: 'idle' })
  render(<MemoryRouter><EventGroup id="e" available /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Leave group' }))
  expect(mocks.leave).not.toHaveBeenCalled()
  const confirm = (await screen.findAllByRole('button', { name: 'Leave group' })).at(-1)!
  fireEvent.click(confirm)
  await waitFor(() => expect(mocks.leave).toHaveBeenCalledOnce())
})

it('turns a dropped connection into plain copy', async () => {
  vi.unstubAllGlobals()
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
  const real = await vi.importActual<typeof import('../../src/features/matchmaking/client')>('../../src/features/matchmaking/client')
  const failure = await real.matchmakingClient('t').groupJoin('fb791b69-851b-4873-ab1e-c248d86fb496').catch((e) => e)
  expect(failure).toBeInstanceOf(MatchmakingClientError)
  expect(failure.message).toMatch(/may not have gone through.*check your connection/)
  vi.unstubAllGlobals()
})
