import type { Page } from '@playwright/test'

// Browser-only module interception; never a production session bypass.
export async function mockMatchingSession(page: Page, signedIn = true, signOutFailures = 0) {
  await page.route('**/src/supabase.ts', route => route.fulfill({ contentType: 'application/javascript', body: `
    let session = ${signedIn ? JSON.stringify({ access_token: 'browser-user-jwt', user: { id: 'a0000000-0000-4000-8000-000000000001' } }) : 'null'};
    let failures = ${signOutFailures};
    const listeners = new Set();
    export const supabase = { auth: {
      onAuthStateChange(callback) { listeners.add(callback); queueMicrotask(() => { if (listeners.has(callback)) callback('INITIAL_SESSION', session); }); return { data: { subscription: { unsubscribe() { listeners.delete(callback); } } } }; },
      signOut: async () => {
        if (failures-- > 0) return { error: new Error('private provider detail') };
        session = null;
        for (const callback of listeners) callback('SIGNED_OUT', null);
        return { error: null };
      },
      getSession: async () => ({ data: { session } }),
      signInWithOtp: async () => ({ error: null })
    } };
  ` }))
}
export const browserProfile = { username: 'sam', display_name: 'Sam', bio: null, birthdate: null, location_city: 'Campus', avatar_url: null, interests: ['Coffee'], availability: [] }
export async function mockMatchingApi(page: Page) {
  let mode: string | null = null
  await page.route('**/api/matchmaking/**', route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path.endsWith('/notifications')) return route.fulfill({ json: { notifications: [], unreadCount: 0 } })
    if (path.endsWith('/profile')) return route.fulfill({ json: { profile: request.method() === 'PUT' ? request.postDataJSON() : browserProfile } })
    if (request.method() === 'POST') mode = request.postDataJSON().mode
    if (request.method() === 'DELETE') mode = null
    if (path.endsWith('/result')) return route.fulfill({ json: { candidate: null } })
    return route.fulfill({ json: { mode } })
  })
}
