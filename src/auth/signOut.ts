import { supabase } from '../supabase'
import { unregisterPushToken } from '../platform/push'

// Cleanup needs the current session, but must never prevent an explicit local sign-out.
export async function signOutLocally() {
  if (!supabase) throw new Error('Sign-out unavailable')
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      unregisterPushToken(controller.signal).catch(() => undefined),
      new Promise<void>(resolve => {
        timer = setTimeout(() => { controller.abort(); resolve() }, 3000)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
  const { error } = await supabase.auth.signOut({ scope: 'local' })
  if (error) throw error
}
