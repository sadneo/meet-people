import { describe, expect, it } from 'vitest'
import { routeForPush } from '../../src/platform/push'

describe('native notification destinations', () => {
  it('opens the Dating mode for a Dating match', () => {
    expect(routeForPush('dating_match')).toBe('/matchmaking?mode=dating')
  })

  it.each(['message', 'connection_request', 'connection_accepted'])('opens Messages for %s', kind => {
    expect(routeForPush(kind)).toBe('/messages')
  })

  it.each([undefined, null, '', '/profile', 'unknown', {}])('ignores unsupported notification kinds: %j', kind => {
    expect(routeForPush(kind)).toBeNull()
  })
})
