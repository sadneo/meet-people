import { expect, it, vi } from 'vitest'
import { eventWorkerSession } from '../../api/event-worker-auth'

const config = { url: 'https://example.supabase.co', publicKey: 'public', credentials: JSON.stringify({ email: 'worker@example.invalid', password: 'a'.repeat(32) }) }
it('gets a fresh session each invocation and revokes its own refresh session on close', async () => {
  const signInWithPassword = vi.fn().mockResolvedValue({ data: { session: { access_token: 'fresh-jwt' } }, error: null })
  const signOut = vi.fn().mockResolvedValue({ error: null })
  const factory = () => ({ auth: { signInWithPassword, signOut } })
  const first = await eventWorkerSession(config, factory)
  const second = await eventWorkerSession(config, factory)
  expect(first.jwt).toBe('fresh-jwt'); expect(second.jwt).toBe('fresh-jwt')
  expect(signInWithPassword).toHaveBeenCalledTimes(2)
  await first.close(); expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
})
it('rejects malformed credentials without exposing values or falling back to a stale token', async () => {
  const factory = vi.fn()
  await expect(eventWorkerSession({ ...config, credentials: 'secret-not-json', legacyJwt: 'old' }, factory)).rejects.toThrow('Invalid worker credential configuration')
  expect(factory).not.toHaveBeenCalled()
})
it('does not echo provider errors or return a token when authentication fails', async () => {
  await expect(eventWorkerSession(config, () => ({ auth: { signInWithPassword: async () => ({ data: { session: null }, error: 'private-provider-error' }), signOut: vi.fn() } }))).rejects.toThrow('Worker authentication unavailable')
})
it('retains explicitly configured legacy-token compatibility for existing sandbox jobs', async () => {
  expect((await eventWorkerSession({ ...config, credentials: undefined, legacyJwt: 'legacy' })).jwt).toBe('legacy')
  await expect(eventWorkerSession({ ...config, credentials: undefined })).rejects.toThrow('Worker credentials unavailable')
})
