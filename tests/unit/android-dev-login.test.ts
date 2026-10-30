import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/platform/native', () => ({ isNative: () => true }))

async function attempt(result: unknown | Error) {
  const { signInAndroidDevUser, AndroidDevLoginError } = await import('../../src/auth/androidDevLogin')
  const signInWithPassword = vi.fn(async () => { if (result instanceof Error) throw result; return result })
  const outcome = await signInAndroidDevUser({ auth: { signInWithPassword } } as never).then(() => null, (error: unknown) => error)
  return { outcome, signInWithPassword, AndroidDevLoginError }
}

beforeEach(() => {
  vi.stubEnv('MODE', 'android-dev')
  vi.stubEnv('VITE_SUPABASE_URL', 'http://10.0.2.2:54321')
  vi.stubEnv('VITE_DEV_LOGIN_EMAIL', 'dev@example.com')
  vi.stubEnv('VITE_DEV_LOGIN_PASSWORD', 'pw-for-tests')
})
afterEach(() => { vi.unstubAllEnvs() })

describe('signInAndroidDevUser', () => {
  it('signs in with the configured account', async () => {
    const { outcome, signInWithPassword } = await attempt({ error: null })
    expect(outcome).toBeNull()
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'dev@example.com', password: 'pw-for-tests' })
  })
  it('reports a missing account separately from other failures', async () => {
    const { outcome } = await attempt({ error: { name: 'AuthApiError', status: 400, code: 'invalid_credentials', message: 'Invalid login credentials' } })
    expect(outcome).toMatchObject({ reason: 'no-account', target: 'http://10.0.2.2:54321' })
  })
  it('reports an unreachable server with the address that was tried', async () => {
    const { outcome } = await attempt({ error: { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' } })
    expect(outcome).toMatchObject({ reason: 'unreachable', target: 'http://10.0.2.2:54321' })
    expect((outcome as { detail: string }).detail).toContain('Failed to fetch')
  })
  it('treats a thrown network error as unreachable', async () => {
    expect(await attempt(new Error('Network request failed')).then(r => r.outcome)).toMatchObject({ reason: 'unreachable' })
  })
  it('passes through any other Supabase refusal with its reason', async () => {
    const { outcome } = await attempt({ error: { name: 'AuthApiError', status: 400, code: 'email_not_confirmed', message: 'Email not confirmed' } })
    expect(outcome).toMatchObject({ reason: 'failed' })
    expect((outcome as { detail: string }).detail).toContain('Email not confirmed')
  })
  it('never calls Supabase when the guard fails or credentials are missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://abcd.supabase.co')
    const hosted = await attempt({ error: null })
    expect(hosted.outcome).toMatchObject({ reason: 'unavailable' }); expect(hosted.signInWithPassword).not.toHaveBeenCalled()
    vi.stubEnv('VITE_SUPABASE_URL', 'http://10.0.2.2:54321'); vi.stubEnv('VITE_DEV_LOGIN_PASSWORD', '')
    const missing = await attempt({ error: null })
    expect(missing.outcome).toMatchObject({ reason: 'not-configured' }); expect(missing.signInWithPassword).not.toHaveBeenCalled()
  })
})
