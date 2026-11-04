import { describe, expect, it } from 'vitest'
import { androidDevLoginAllowed, isPrivateDevUrl } from '../../src/auth/androidDevGuard'

const ok = { mode: 'android-dev', native: true, supabaseUrl: 'http://10.0.2.2:54321' }

describe('isPrivateDevUrl', () => {
  it.each(['http://10.0.2.2:54321', 'http://localhost:54321', 'http://127.0.0.1:54321', 'http://192.168.1.20:54321', 'http://10.1.2.3:54321', 'http://172.16.0.5:54321', 'http://172.31.255.1'])('accepts %s', url => {
    expect(isPrivateDevUrl(url)).toBe(true)
  })
  it.each([
    'https://abcd.supabase.co', 'https://10.0.2.2:54321', 'http://abcd.supabase.co', 'http://8.8.8.8', 'http://172.32.0.1', 'http://172.15.0.1',
    'http://192.169.1.1', 'http://10.0.2.2.evil.com', 'http://localhost.evil.com', 'http://evil.com/10.0.2.2', '', 'not a url',
  ])('rejects %s', url => {
    expect(isPrivateDevUrl(url)).toBe(false)
  })
  it('rejects a missing url', () => { expect(isPrivateDevUrl(undefined)).toBe(false) })
})

describe('androidDevLoginAllowed', () => {
  it('allows only the android-dev build, inside the app, against a private http Supabase', () => {
    expect(androidDevLoginAllowed(ok)).toBe(true)
  })
  it('is off for every other build mode', () => {
    for (const mode of ['android', 'production', 'development', 'test', '']) expect(androidDevLoginAllowed({ ...ok, mode })).toBe(false)
  })
  it('is off in a browser', () => { expect(androidDevLoginAllowed({ ...ok, native: false })).toBe(false) })
  it('is off against a hosted project even in the dev build', () => {
    expect(androidDevLoginAllowed({ ...ok, supabaseUrl: 'https://abcd.supabase.co' })).toBe(false)
    expect(androidDevLoginAllowed({ ...ok, supabaseUrl: undefined })).toBe(false)
  })
})
