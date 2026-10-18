import type { Page } from '@playwright/test'
import type { MatchingProfile } from '../shared/matchmaking'
import type { AccountProfile } from '../shared/account-profile'
import { mockMatchingSession } from './matchmaking-fixture'

export async function sharedProfileFixture(page: Page, options: { identity?: 'available' | 'missing' | 'unavailable'; missingProfile?: boolean; interests?: string[] } = {}) {
  const initial = { username: 'canonical-sam', display_name: 'Canonical Sam', bio: 'Canonical bio', avatar_url: null }
  let account: AccountProfile | null = options.identity === 'missing' ? null : initial
  let profile: MatchingProfile | null = options.missingProfile ? null : { ...initial, display_name: 'Legacy Sam', bio: 'Legacy bio', interests: options.interests ?? ['Coffee', 'Music', 'Books', 'Art', 'Games', 'Hiking'], availability: [{ dow: 2, start_time: '09:15:00', end_time: '11:45:00' }, { dow: 0, start_time: '21:00:00', end_time: '24:00:00' }], location_city: 'Campus', birthdate: '2000-01-01' }
  const calls: { path: string; method: string; body: unknown }[] = [], external: string[] = []
  await page.route('**/*', route => {
    const request = route.request(), url = new URL(request.url())
    if (url.origin !== 'http://127.0.0.1:3194') { external.push(url.origin); return route.abort() }
    if (!url.pathname.startsWith('/api/')) return route.continue()
    calls.push({ path: url.pathname, method: request.method(), body: request.method() === 'PUT' ? request.postDataJSON() : null })
    if (url.pathname.endsWith('/account-profile')) {
      if (options.identity === 'unavailable') return route.fulfill({ status: 503, json: { code: 'unavailable', error: 'Identity unavailable.' } })
      if (request.method() === 'PUT') account = request.postDataJSON()
      return route.fulfill({ json: { profile: account } })
    }
    if (url.pathname.endsWith('/profile')) {
      if (request.method() === 'PUT') profile = request.postDataJSON()
      return route.fulfill({ json: { profile } })
    }
    if (url.pathname.endsWith('/notifications')) return route.fulfill({ json: { notifications: [], unreadCount: 0 } })
    if (url.pathname.endsWith('/status')) return route.fulfill({ json: { mode: null } })
    return route.fulfill({ status: 503, json: { code: 'unavailable', error: 'Unconnected test boundary.' } })
  })
  await mockMatchingSession(page)
  return { calls, external, profile: () => profile, account: () => account }
}
