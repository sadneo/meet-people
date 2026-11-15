import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

type WorkerAuthClient = {
  auth: {
    signInWithPassword(value: { email: string; password: string }): PromiseLike<{ data: { session: { access_token: string } | null }; error: unknown }>
    signOut(value: { scope: 'local' }): PromiseLike<unknown>
  }
}
export async function eventWorkerSession(config: { url: string; publicKey: string; credentials?: string; legacyJwt?: string }, factory: (url: string, key: string) => WorkerAuthClient = (url, key) => createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15_000) }) },
})) {
  if (!config.credentials) {
    if (!config.legacyJwt) throw new Error('Worker credentials unavailable')
    return { jwt: config.legacyJwt, close: async () => {} }
  }
  let credentials: { email: string; password: string }
  try { credentials = z.object({ email: z.email(), password: z.string().min(24) }).strict().parse(JSON.parse(config.credentials)) }
  catch { throw new Error('Invalid worker credential configuration') }
  const client = factory(config.url, config.publicKey)
  try {
    const result = await client.auth.signInWithPassword(credentials)
    if (result.error || !result.data.session?.access_token) throw new Error('Worker authentication unavailable')
    return { jwt: result.data.session.access_token, close: async () => { try { await client.auth.signOut({ scope: 'local' }) } catch { /* The bounded one-shot session still expires. */ } } }
  } catch { throw new Error('Worker authentication unavailable') }
}
