import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { supabase } from '../supabase'
import { useSession } from './useSession'
import { centralSignInPath } from './returnTo'

export function useLogout() {
  const { session, ready } = useSession()
  const navigate = useNavigate()
  const { pathname, search, hash } = useLocation()
  const live = useRef(false)
  const pending = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    live.current = true
    return () => { live.current = false }
  }, [])

  async function logout() {
    if (!live.current || pending.current) return
    const destination = centralSignInPath(`${pathname}${search}${hash}`)
    pending.current = true
    setBusy(true); setError('')
    try {
      if (!supabase) throw new Error('Sign-out unavailable')
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) throw error
      // The SDK's SIGNED_OUT notification clears every existing useSession subscriber.
      // Do not invent a local session change or navigate on a failed sign-out.
      // Account identity changes intentionally unmount the old workspace.
      // Successful logout must still navigate after that cleanup.
      navigate(destination, { replace: true })
    } catch {
      if (live.current) setError('Could not log out. Your session may still be active. Please try again.')
    } finally {
      pending.current = false
      if (live.current) setBusy(false)
    }
  }
  return { session, ready, busy, error, logout }
}
