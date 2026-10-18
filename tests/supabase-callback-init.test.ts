import { afterEach, expect, it, vi } from 'vitest'

const create = vi.hoisted(() => vi.fn<(url: string, key: string, options?: unknown) => unknown>(() => ({ auth: {} })))
vi.mock('@supabase/supabase-js', () => ({ createClient: create }))
vi.mock('../src/env', () => ({ env: { VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: 'public-fixture-not-a-real-key' } }))
afterEach(() => { create.mockClear(); window.history.replaceState({}, '', '/') })
for (const path of ['/auth/callback', '/auth/callback/', '/AUTH/CALLBACK', '/auth/%63allback']) {
  it(`disables automatic URL detection on callback route ${path}`, async () => {
    vi.resetModules(); window.history.replaceState({}, '', `${path}?code=fixture`)
    await import('../src/supabase')
    expect(create.mock.calls[0]?.[2]).toEqual({ auth: { detectSessionInUrl: false } })
  })
}
for (const path of ['/login', '/settings', '/', '/auth/forgot-password']) {
  it(`preserves SDK defaults on ${path}`, async () => {
    vi.resetModules(); window.history.replaceState({}, '', path)
    await import('../src/supabase')
    expect(create.mock.calls[0]?.[2]).toBeUndefined()
  })
}
