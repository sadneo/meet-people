import type { SupabaseClient } from '@supabase/supabase-js'
import { androidDevLoginAllowed, getAndroidDevEnvironment } from './androidDevGuard'

type Reason = 'unavailable' | 'not-configured' | 'no-account' | 'unreachable' | 'failed'

// `message` is the machine-readable reason; `detail` is the underlying error, safe to show in a dev-only message.
export class AndroidDevLoginError extends Error {
  constructor(readonly reason: Reason, readonly detail = '', readonly target = '') { super(reason) }
}

// Loaded only through a dynamic import inside an `import.meta.env.MODE === 'android-dev'` branch.
// The credentials are read here, and nowhere else, so they cannot end up in any other build.
export async function signInAndroidDevUser(client: SupabaseClient) {
  const environment = getAndroidDevEnvironment()
  if (!androidDevLoginAllowed(environment)) throw new AndroidDevLoginError('unavailable')
  const target = environment.supabaseUrl ?? ''
  const email = import.meta.env.VITE_DEV_LOGIN_EMAIL as string | undefined
  const password = import.meta.env.VITE_DEV_LOGIN_PASSWORD as string | undefined
  if (!email || !password) throw new AndroidDevLoginError('not-configured')
  let failure: { name?: string; message?: string; status?: number; code?: string } | null
  try {
    failure = (await client.auth.signInWithPassword({ email, password })).error
  } catch (thrown) {
    failure = { name: 'Error', message: thrown instanceof Error ? thrown.message : 'unknown error', status: 0 }
  }
  if (!failure) return // The session listener owns navigation and any mandatory onboarding, as for a normal sign-in.
  const detail = `${failure.name ?? 'Error'}${failure.status ? ` ${failure.status}` : ''}: ${failure.message ?? ''}`.trim()
  if (failure.code === 'invalid_credentials') throw new AndroidDevLoginError('no-account', detail, target)
  // supabase-js reports "could not reach the server" (offline, blocked, wrong address) as AuthRetryableFetchError.
  if (failure.name === 'AuthRetryableFetchError' || failure.status === 0) throw new AndroidDevLoginError('unreachable', detail, target)
  throw new AndroidDevLoginError('failed', detail, target)
}
