import { act, cleanup, render, waitFor } from '@testing-library/react'
import { useLayoutEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyDetailedSettings } from '../../shared/detailed-settings'
import { useDetailedSettings } from '../../src/features/account/useDetailedSettings'
import { useDatingPreferences } from '../../src/features/matchmaking/useDatingPreferences'
import { useFriendsPreferences } from '../../src/features/matchmaking/useFriendsPreferences'
import { detailedSettingsFixture } from './detailed-settings-fixture'
import { datingUiFixture } from './dating-ui-fixture'
import { friendsPreferencesFixture } from './friends-preferences-fixture'

const resources = [
  {
    name: 'detailed settings',
    setup() {
      const fixture = detailedSettingsFixture()
      return {
        fixture,
        useResource(owner: string, token: string, busy: boolean) {
          const resource = useDetailedSettings(owner, token, busy)
          return { canWrite: resource.canWrite, save: () => resource.save({ expectedRevision: 0, settings: { ...emptyDetailedSettings(), messages: true } }) }
        },
      }
    },
  },
  {
    name: 'Dating preferences',
    setup() {
      const fixture = datingUiFixture()
      return {
        fixture,
        useResource(owner: string, token: string, busy: boolean) {
          const resource = useDatingPreferences(owner, token, busy)
          const stored = fixture.state.stored
          return { canWrite: resource.canWrite, save: () => resource.save({
            expectedProfileRevision: stored.profileRevision, expectedSearchRevision: stored.searchRevision,
            profile: { ...stored.profile, heightInches: 60, enabled: false },
            search: { ageMin: 18, ageMax: 99, radiusMiles: 15, searchArea: { source: 'home', resolvedLocationRef: null } },
          }) }
        },
      }
    },
  },
  {
    name: 'Friends preferences',
    setup() {
      const fixture = friendsPreferencesFixture()
      return {
        fixture,
        useResource(owner: string, token: string, busy: boolean) {
          const resource = useFriendsPreferences(owner, token, busy)
          return { canWrite: resource.canWrite, save: () => resource.save({ expectedRevision: 0,
            preferences: { ageMin: 18, ageMax: 35, radiusMiles: 15, goals: [], searchArea: { source: 'home', resolvedLocationRef: null } },
          }) }
        },
      }
    },
  },
]

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe.each(resources)('$name', ({ setup }) => {
  it.each(['owner', 'token', 'busy'])('blocks a retained save in a child layout effect during a %s change', async change => {
    const { fixture, useResource } = setup()
    let retained: (() => Promise<unknown>) | undefined
    let attempt: Promise<unknown> | undefined

    function Child({ invoke, canWrite }: { invoke: boolean; canWrite: boolean }) {
      useLayoutEffect(() => {
        if (invoke && !attempt) {
          expect(canWrite).toBe(false)
          attempt = retained!()
        }
      }, [invoke, canWrite])
      return <output>{String(canWrite)}</output>
    }
    function Parent({ owner, token, busy, invoke }: { owner: string; token: string; busy: boolean; invoke: boolean }) {
      const resource = useResource(owner, token, busy)
      useLayoutEffect(() => { if (!invoke) retained = resource.save }, [invoke, resource.save])
      return <Child invoke={invoke} canWrite={resource.canWrite} />
    }

    const view = render(<Parent owner="first" token="first-token" busy={false} invoke={false} />)
    await waitFor(() => expect(view.getByRole('status').textContent).toBe('true'))
    view.rerender(<Parent owner={change === 'owner' ? 'second' : 'first'} token={change === 'token' ? 'renewed-token' : 'first-token'} busy={change === 'busy'} invoke />)
    await act(async () => { expect(await attempt).toBeNull() })
    expect(fixture.puts()).toHaveLength(0)
  })
})
