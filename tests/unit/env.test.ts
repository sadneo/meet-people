import { describe, expect, it } from 'vitest'
import { parseApiEnv } from '../../api/env'
import { parseBrowserEnv } from '../../src/env'

describe('environment validation', () => {
  it('accepts complete browser and API Supabase configuration', () => {
    expect(parseBrowserEnv({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'public-key',
    }).VITE_SUPABASE_URL).toBe('https://example.supabase.co')
    expect(parseApiEnv({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'server-key',
    }).SUPABASE_URL).toBe('https://example.supabase.co')
  })

  it('rejects incomplete Supabase configuration', () => {
    expect(() => parseBrowserEnv({ VITE_SUPABASE_URL: 'https://example.supabase.co' })).toThrow()
    expect(() => parseApiEnv({ SUPABASE_SERVICE_ROLE_KEY: 'server-key' })).toThrow()
  })

  it('has no matchmaking feature flags to configure or default off', () => {
    const env = parseApiEnv({})
    expect(env).not.toHaveProperty('DATING_RULES_ENABLED')
    expect(env).not.toHaveProperty('FRIENDS_RULES_ENABLED')
    expect(env).not.toHaveProperty('ACTIVE_FRIENDS_ENABLED')
  })

  it('allows the finite email limit only for isolated development QA targets', () => {
    const qa = { NODE_ENV: 'development', QA_RUN_ID: '20261101-120000-1234abcd', QA_AUTH_EMAIL_REQUESTS_PER_WINDOW: '300',
      SUPABASE_URL: 'http://127.0.0.1:55421', SUPABASE_SERVICE_ROLE_KEY: 'qa-only-key' }
    expect(parseApiEnv(qa).QA_AUTH_EMAIL_REQUESTS_PER_WINDOW).toBe(300)
    expect(parseApiEnv({}).QA_AUTH_EMAIL_REQUESTS_PER_WINDOW).toBeUndefined()
    for (const changes of [{ NODE_ENV: 'production' }, { NODE_ENV: 'test' }, { QA_RUN_ID: undefined }, { QA_RUN_ID: '../invalid' },
      { SUPABASE_URL: 'http://127.0.0.1:54321' }, { SUPABASE_URL: 'https://hosted.supabase.co' },
      { SUPABASE_URL: 'http://localhost:55421' }, { SUPABASE_URL: 'http://127.0.0.1:55422' },
      { QA_AUTH_EMAIL_REQUESTS_PER_WINDOW: '301' }, { QA_AUTH_EMAIL_REQUESTS_PER_WINDOW: '0' }]) {
      expect(() => parseApiEnv({ ...qa, ...changes })).toThrow()
    }
  })
})
