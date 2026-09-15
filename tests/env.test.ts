import { describe, expect, it } from 'vitest'
import { parseApiEnv } from '../api/env'
import { parseBrowserEnv } from '../src/env'

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
})
