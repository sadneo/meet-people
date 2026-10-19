import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { getLocalDevelopmentEnvironment, isLocalDevelopment } from './localDevelopment'

const payload = z.object({ session: z.object({ access_token: z.string().min(1).max(8192), refresh_token: z.string().min(1).max(8192), expires_in: z.number().positive().max(86400), token_type: z.literal('bearer'), user: z.object({ id: z.uuid() }).strict() }).strict() }).strict()

// Dynamically imported only from a build-time DEV branch. Not an SDK/session bypass.
export async function signInDevelopmentUser(client: SupabaseClient, current: () => boolean) {
  const allowed = () => import.meta.env.DEV && isLocalDevelopment(getLocalDevelopmentEnvironment()) && current()
  if (!allowed()) throw new Error('Development sign-in unavailable')
  const response = await fetch('/__dev/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ intent: 'development-sign-in' }), credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(25000) })
  if (!allowed() || !response.ok) throw new Error('Development provisioning unavailable')
  const { session } = payload.parse(await response.json())
  if (!allowed()) throw new Error('Stale development sign-in')
  const installed = await client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token })
  if (!allowed() || installed.error || installed.data.session?.user.id !== session.user.id) throw new Error('Development SDK verification failed')
  const verified = await client.auth.getUser()
  if (!allowed() || verified.error || verified.data.user?.id !== session.user.id || verified.data.user.is_anonymous !== false) throw new Error('Development user verification failed')
}
