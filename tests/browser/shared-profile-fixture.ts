import type { Page } from '@playwright/test'
import type { MatchingProfile } from '../../shared/matchmaking'
import type { AccountProfile } from '../../shared/account-profile'
import { browserAccount, mockMatchingSession } from './matchmaking-fixture'
import { emptyAccount, type Account } from '../../shared/account'
import { SaveProfileDetailsSchema, type ProfileDetails } from '../../shared/profile-details'
import { emptyDetailedSettings, effectiveDetailedSettings, mastersFromLegacySettings, SaveDetailedSettingsSchema } from '../../shared/detailed-settings'
import { emptyDatingProfile, adultOn, SaveDatingAggregateSchema, validDatingTransition, type DatingAggregate } from '../../shared/dating'
import { SaveFriendsSearchPreferencesSchema, type FriendsSearchPreferences } from '../../shared/friends-search-preferences'

export async function sharedProfileFixture(page: Page, options: { identity?: 'available' | 'missing' | 'unavailable'; details?: 'unavailable'; detailedSettings?: 'unavailable'; dating?: 'unavailable' | 'legacy'; friends?: 'unavailable' | 'custom'; missingProfile?: boolean; interests?: string[]; queue?: boolean } = {}) {
  const initial = { username: 'canonical-sam', display_name: 'Canonical Sam', bio: 'Canonical bio', avatar_url: null }
  let account: AccountProfile | null = options.identity === 'missing' ? null : initial
  let profile: MatchingProfile | null = options.missingProfile ? null : { ...initial, display_name: 'Legacy Sam', bio: 'Legacy bio', interests: options.interests ?? ['Coffee', 'Music', 'Books', 'Art', 'Games', 'Hiking'], availability: [{ dow: 2, start_time: '09:15:00', end_time: '11:45:00' }, { dow: 0, start_time: '21:00:00', end_time: '24:00:00' }], location_city: 'Campus', birthdate: '2000-01-01' }
  let unified: Account = account ? profile ? browserAccount({ ...profile, ...account }) : { ...structuredClone(emptyAccount), profile: { ...account, interests: [], availability: [], birthdate: null, location_city: null }, completed: [0] } : structuredClone(emptyAccount)
  let mode: 'active' | null = null
  // Synthetic owner facts service, separate from the fixture's account document.
  let details: ProfileDetails = { revision: 0, facts: { education: '', occupation: '', languages: [], visibility: { education: false, occupation: false, languages: false } } }
  let detailed = { revision: 0, settings: emptyDetailedSettings() }
  let friends: FriendsSearchPreferences = options.friends === 'custom' ? { revision: 1, preferences: { ageMin: 21, ageMax: 40, radiusMiles: 10, goals: [' Exact custom goal 🪨 '], searchArea: { source: 'home', resolvedLocationRef: null } } } : { revision: 0, preferences: null }
  let dating: DatingAggregate = { profileRevision: options.dating === 'legacy' ? 1 : 0, searchRevision: options.dating === 'legacy' ? 1 : 0, profile: options.dating === 'legacy' ? { ...emptyDatingProfile(), gender: 'Legacy identity', sexuality: 'Queer', heightInches: 60, clarifiedTargets: ['Man'] } : emptyDatingProfile(), search: null, eligibility: { asOf: '2026-10-19', adult: adultOn(unified.profile?.birthdate, '2026-10-19'), locationResolved: false }, effectiveEnabled: false }
  const calls: { path: string; method: string; body: unknown }[] = [], external: string[] = []
  await page.route('**/*', route => {
    const request = route.request(), url = new URL(request.url())
    if (url.origin !== 'http://127.0.0.1:3194') { external.push(url.origin); return route.abort() }
    if (!url.pathname.startsWith('/api/')) return route.continue()
    calls.push({ path: url.pathname, method: request.method(), body: request.method() === 'PUT' ? request.postDataJSON() : null })
    if (url.pathname.endsWith('/friends-search-preferences')) {
      if (options.friends === 'unavailable') return route.fulfill({ status: 503, json: { code: 'unavailable', error: 'Friends filters unavailable.' } })
      if (request.method() === 'PUT') {
        const write = SaveFriendsSearchPreferencesSchema.parse(request.postDataJSON())
        if (write.expectedRevision !== friends.revision) return route.fulfill({ status: 409, json: { code: 'conflict', error: 'Friends filters changed.' } })
        if (write.preferences.searchArea.resolvedLocationRef !== null) return route.fulfill({ status: 400, json: { code: 'invalid', error: 'No trusted resolver in this fixture.' } })
        friends = { revision: friends.revision + 1, preferences: write.preferences }
      }
      return route.fulfill({ json: friends })
    }
    if (url.pathname.endsWith('/dating-preferences')) {
      if (options.dating === 'unavailable') return route.fulfill({ status: 503, json: { code: 'unavailable', error: 'Dating preferences unavailable.' } })
      if (request.method() === 'PUT') {
        const write = SaveDatingAggregateSchema.parse(request.postDataJSON())
        if (write.expectedProfileRevision !== dating.profileRevision || write.expectedSearchRevision !== dating.searchRevision) return route.fulfill({ status: 409, json: { code: 'conflict', error: 'Dating preferences changed.' } })
        if (write.profile.enabled || !validDatingTransition(dating.profile, write.profile)) return route.fulfill({ status: 400, json: { code: 'invalid', error: 'Invalid disabled Dating draft/clarification.' } })
        dating = { ...dating, profileRevision: dating.profileRevision + 1, searchRevision: dating.searchRevision + 1, profile: write.profile, search: write.search, effectiveEnabled: false }
      }
      return route.fulfill({ json: dating })
    }
    if (url.pathname.endsWith('/detailed-settings')) {
      if (options.detailedSettings === 'unavailable') return route.fulfill({ status: 503, json: { code: 'unavailable', error: 'Detailed preferences unavailable.' } })
      if (request.method() === 'PUT') {
        const write = SaveDetailedSettingsSchema.parse(request.postDataJSON())
        if (write.expectedRevision !== detailed.revision) return route.fulfill({ status: 409, json: { code: 'conflict', error: 'Detailed preferences changed.' } })
        detailed = { revision: detailed.revision + 1, settings: write.settings }
      }
      const masters = mastersFromLegacySettings(unified.settings)
      return route.fulfill({ json: { ...detailed, masters, effective: effectiveDetailedSettings(detailed.settings, masters) } })
    }
    if (url.pathname.endsWith('/profile-details')) {
      if (options.details === 'unavailable') return route.fulfill({ status: 503, json: { code: 'unavailable', error: 'Optional details unavailable.' } })
      if (request.method() === 'PUT') {
        const write = SaveProfileDetailsSchema.parse(request.postDataJSON())
        if (write.expectedRevision !== details.revision) return route.fulfill({ status: 409, json: { code: 'conflict', error: 'Details changed.' } })
        details = { revision: details.revision + 1, facts: write.facts }
      }
      return route.fulfill({ json: details })
    }
    if (url.pathname.endsWith('/account')) {
      if (options.identity === 'unavailable') return route.fulfill({ status: 503, json: { code: 'unavailable', error: 'Identity unavailable.' } })
      if (request.method() === 'PUT') {
        unified = request.postDataJSON(); profile = unified.profile
        account = profile ? { username: profile.username, display_name: profile.display_name, bio: profile.bio, avatar_url: profile.avatar_url } : null
      }
      return route.fulfill({ json: unified })
    }
    if (url.pathname.endsWith('/account-profile')) {
      if (options.identity === 'unavailable') return route.fulfill({ status: 503, json: { code: 'unavailable', error: 'Identity unavailable.' } })
      if (request.method() === 'PUT') { account = request.postDataJSON(); if (unified.profile) unified = { ...unified, profile: { ...unified.profile, ...account! } } }
      return route.fulfill({ json: { profile: account } })
    }
    if (url.pathname.endsWith('/profile')) {
      if (request.method() === 'PUT') { profile = request.postDataJSON(); unified = { ...unified, profile } }
      return route.fulfill({ json: { profile } })
    }
    if (url.pathname.endsWith('/notifications')) return route.fulfill({ json: { notifications: [], unreadCount: 0 } })
    if (url.pathname.endsWith('/status')) return route.fulfill({ json: { mode } })
    if (options.queue && url.pathname.endsWith('/queue')) { mode = request.method() === 'POST' ? 'active' : null; return route.fulfill({ json: { mode } }) }
    if (options.queue && url.pathname.endsWith('/result')) return route.fulfill({ json: { candidate: null } })
    return route.fulfill({ status: 503, json: { code: 'unavailable', error: 'Unconnected test boundary.' } })
  })
  await mockMatchingSession(page)
  return { calls, external, profile: () => profile, account: () => account, unified: () => unified }
}
