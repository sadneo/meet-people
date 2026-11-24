import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  status: { available: true, eligible: false, reason: 'discovery_off' } as Record<string, unknown>,
  detailed: { snapshot: { settings: { friendsDiscovery: true }, masters: { discoverable: true } }, loading: false } as Record<string, unknown>,
  deck: {} as Record<string, unknown>,
}))
const deck = (over: Record<string, unknown>) => ({ cards: [], outcomes: [], loading: false, error: '', errorCode: '', searched: true, canUndo: false, reset: vi.fn(), advance: vi.fn(), undo: vi.fn(), connect: vi.fn(), ...over })

vi.mock('../../src/ui/current', () => ({ useCurrent: () => ({ session: { user: { id: 'u1' }, access_token: 't' }, account: { profile: { birthdate: '2000-01-01' } }, busy: false }) }))
vi.mock('../../src/features/account/useDetailedSettings', () => ({ useDetailedSettings: () => state.detailed }))
vi.mock('../../src/ui/matching-client', () => ({ matchingClient: () => ({ friendsStatus: async () => state.status }) }))
vi.mock('../../src/features/matchmaking/friends-preferences-client', () => ({ friendsPreferencesClient: () => ({ read: async () => ({ preferences: { searchArea: { source: 'temporary', areaLabel: 'Campus', resolvedLocationRef: 'x' } } }) }) }))
vi.mock('../../src/features/matchmaking/dating-live-client', () => ({ datingLiveClient: () => ({ status: async () => ({ aggregate: { eligibility: { adult: true }, profile: { enabled: false }, profileRevision: 1, searchRevision: 1 }, globalDiscovery: true, datingDiscovery: true }) }), DatingLiveError: class extends Error {} }))
vi.mock('../../shared/dating-live', async importOriginal => ({ ...await importOriginal<object>(), datingDiscoveryBlocker: () => 'paused' }))
vi.mock('../../src/ui/useDiscoveryDeck', () => ({ useDiscoveryDeck: () => state.deck }))
vi.mock('../../src/ui/useRequestAllowance', () => ({ useRequestAllowance: () => ({ value: null, checking: false, limited: false, blocked: false, refresh: vi.fn(), send: vi.fn() }) }))
vi.mock('../../src/ui/Preferences', () => ({ DatingPreferencesPanel: () => null, FriendsPreferencesPanel: () => null }))
vi.mock('../../src/ui/MatchingSetup', () => ({ MatchingSetup: () => null }))
vi.mock('../../src/ui/PhotoGallery', () => ({ DiscoverPhotos: () => null }))
vi.mock('../../src/ui/Safety', () => ({ SafetyActions: () => null }))
vi.mock('../../src/ui/ProfileCustomization', () => ({ PromptCards: () => null }))
vi.mock('../../src/features/account/profile-customization-client', () => ({ useProfilePrompts: () => ({}), useProfileShowcase: () => ({}) }))
vi.mock('../../src/features/garden/ArtPreview', () => ({ ArtPreview: () => null }))

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Discover } from '../../src/ui/Discover'
const view = () => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><Discover /></MemoryRouter></QueryClientProvider>)

beforeEach(() => {
  state.status = { available: true, eligible: false, reason: 'discovery_off' }
  state.detailed = { snapshot: { settings: { friendsDiscovery: true }, masters: { discoverable: true } }, loading: false }
  state.deck = deck({})
})
afterEach(cleanup)

it('does not say Friends is paused when both switches are on', async () => {
  view()
  expect(await screen.findByText('Set up Friends matchmaking.')).toBeTruthy()
  expect(screen.queryByText('Friends discovery is paused.')).toBeNull()
})

it('still says paused when the Friends switch is off', async () => {
  state.detailed = { snapshot: { settings: { friendsDiscovery: false }, masters: { discoverable: true } }, loading: false }
  view()
  expect(await screen.findByText('Friends discovery is paused.')).toBeTruthy()
})

it('shows a next step in the empty queue', async () => {
  state.status = { available: true, eligible: true, reason: null }
  view()
  expect(await screen.findByText('You’re out of people nearby.')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Change filters' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Refresh' })).toBeTruthy()
})

it('shows only the retryable error, not the empty state, when loading fails', async () => {
  state.status = { available: true, eligible: true, reason: null }
  state.deck = deck({ searched: false, error: 'Couldn’t load people. Check your connection and try again.' })
  view()
  expect(await screen.findByText(/Couldn’t load people/)).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  expect(screen.queryByText('Your next connection starts here.')).toBeNull()
})

it('confirms a sent request clearly and links to sent requests', async () => {
  state.status = { available: true, eligible: true, reason: null }
  state.deck = deck({ outcomes: [{ person: { id: 'p1', name: 'Hank' }, state: 'confirmed', result: { status: 'pending' } }] })
  view()
  expect(await screen.findByText('Request sent to Hank.')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'View sent requests' }).getAttribute('href')).toBe('/messages/requests')
})

it('flags an expired search area on the header chip', async () => {
  state.status = { available: true, eligible: false, reason: 'location' }
  view()
  expect(await screen.findByText('Area expired · Update')).toBeTruthy()
})
