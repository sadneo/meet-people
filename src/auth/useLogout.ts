import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { supabase } from '../supabase'
import { useSession } from './useSession'

export function useLogout() {
  const { session, ready } = useSession()
  const navigate = useNavigate()
  const live = useRef(false)
  const pending = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    live.current = true
    return () => { live.current = false }
  }, [])

  async function logout() {
    if (pending.current) return
    pending.current = true
    setBusy(true); setError('')
    try {
      if (!supabase) throw new Error('Sign-out unavailable')
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) throw error
      // The SDK's SIGNED_OUT notification clears every existing useSession subscriber.
      // Do not invent a local session change or navigate on a failed sign-out.
      if (live.current) navigate('/login')
    } catch {
      if (live.current) setError('Could not log out. Your session may still be active. Please try again.')
    } finally {
      pending.current = false
      if (live.current) setBusy(false)
    }
  }
  return { session, ready, busy, error, logout }
}
