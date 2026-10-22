import type { Page } from '@playwright/test'
import { completedAccountChapters, emptyAccount, type Account } from '../../shared/account'
import { SaveFriendsSearchPreferencesSchema, type FriendsSearchPreferences } from '../../shared/friends-search-preferences'

// Browser-only module interception; never a production session bypass.
export async function mockMatchingSession(page: Page, signedIn = true, signOutFailures = 0, principal = { id: 'a0000000-0000-4000-8000-000000000001', token: 'browser-user-jwt' }) {
  await page.route('**/src/supabase.ts', route => route.fulfill({ contentType: 'application/javascript', body: `
    let session = ${signedIn ? JSON.stringify({ access_token: principal.token, user: { id: principal.id } }) : 'null'};
    let failures = ${signOutFailures};
    const listeners = new Set();
    export const supabase = { auth: {
      onAuthStateChange(callback) { listeners.add(callback); queueMicrotask(() => { if (listeners.has(callback)) callback('INITIAL_SESSION', session); }); return { data: { subscription: { unsubscribe() { listeners.delete(callback); } } } }; },
      signOut: async (options) => {
        if (options?.scope !== 'local') throw new Error('Expected browser-local sign-out');
        if (failures-- > 0) return { error: new Error('private provider detail') };
        session = null;
        for (const callback of listeners) callback('SIGNED_OUT', null);
        return { error: null };
      },
      getSession: async () => ({ data: { session } }),
      getUser: async () => ({ data: { user: session ? { ...session.user, email: 'browser@example.test', email_confirmed_at: '2026-10-01', is_anonymous: false } : null }, error: null }),
      signInWithOtp: async () => ({ error: null }),
      setSession: async ({ access_token, refresh_token }) => {
        if (access_token !== ${JSON.stringify(principal.token)} || refresh_token !== 'browser-refresh-fixture') return { data: { session: null }, error: new Error('Fixture SDK rejected session') };
        session = { access_token, user: { id: ${JSON.stringify(principal.id)} } };
        for (const callback of listeners) callback('SIGNED_IN', session);
        return { data: { session }, error: null };
      },
      signInWithPassword: async ({ email, password }) => {
        if (email !== 'development-fixture@example.test' || password !== 'Synthetic-fixture-password-1!') return { data: { session: null }, error: new Error('Fixture credentials rejected') };
        session = { access_token: ${JSON.stringify(principal.token)}, user: { id: ${JSON.stringify(principal.id)} } };
        for (const callback of listeners) callback('SIGNED_IN', session);
        return { data: { session }, error: null };
      }
    } };
  ` }))
}
export const browserProfile = { username: 'sam', display_name: 'Sam', bio: null, birthdate: '2000-01-01', location_city: 'Campus', avatar_url: null, interests: ['Coffee', 'Books', 'Games'], availability: [{ dow: 0, start_time: '21:00:00', end_time: '24:00:00' }] }
// Explicit synthetic persisted choices, never a runtime default or session bypass.
export function browserAccount(profile: Account['profile'] = browserProfile): Account {
  const account: Account = { ...emptyAccount, profile, preferences: { intents: ['Meet new people'], usual: [], distance: 'Nearby', group: 'Either' }, completed: [] }
  return { ...account, completed: completedAccountChapters(account) }
}
export async function mockMatchingApi(page: Page) {
  let mode: string | null = null
  let profile = browserProfile
  let account = browserAccount(profile)
  let friends: FriendsSearchPreferences = { revision: 0, preferences: null }
  // Signed-in shell and candidate card: the Messages dot and per-person connection state.
  const connections = new Map<string, string>()
  await page.route('**/api/conversations/activity', route => route.fulfill({ json: { unreadConversations: 0, incomingRequests: 0 } }))
  await page.route('**/api/connections/**', route => {
    const request = route.request()
    const id = new URL(request.url()).pathname.split('/')[3]
    if (request.method() === 'POST') connections.set(id, 'sent')
    if (request.method() === 'DELETE') connections.delete(id)
    return route.fulfill({ json: { status: connections.get(id) ?? 'none', conversationId: null } })
  })
  await page.route('**/api/matchmaking/**', route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path.endsWith('/friends-search-preferences')) {
      if (request.method() === 'PUT') {
        const write = SaveFriendsSearchPreferencesSchema.parse(request.postDataJSON())
        if (write.expectedRevision !== friends.revision) return route.fulfill({ status: 409, json: { code: 'conflict', error: 'Friends filters changed.' } })
        if (write.preferences.searchArea.resolvedLocationRef !== null) return route.fulfill({ status: 400, json: { code: 'invalid', error: 'No trusted resolver in this fixture.' } })
        friends = { revision: friends.revision + 1, preferences: write.preferences }
      }
      return route.fulfill({ json: friends })
    }
    if (path.endsWith('/notifications')) return route.fulfill({ json: { notifications: [], unreadCount: 0 } })
    if (path.endsWith('/account')) {
      if (request.method() === 'PUT') { account = request.postDataJSON(); profile = account.profile as typeof browserProfile }
      return route.fulfill({ json: { ...account, profile } })
    }
    if (path.endsWith('/account-profile')) return route.fulfill({ json: { profile: { username: browserProfile.username, display_name: browserProfile.display_name, bio: browserProfile.bio, avatar_url: browserProfile.avatar_url } } })
    if (path.endsWith('/profile')) { if (request.method() === 'PUT') profile = request.postDataJSON(); return route.fulfill({ json: { profile } }) }
    if (request.method() === 'POST') mode = request.postDataJSON().mode
    if (request.method() === 'DELETE') mode = null
    if (path.endsWith('/result')) return route.fulfill({ json: { candidate: null } })
    return route.fulfill({ json: { mode } })
  })
}
