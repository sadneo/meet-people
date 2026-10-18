import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import type { Session } from '@supabase/supabase-js'
import { emptyAccount, type Account } from '../../shared/account'
import { matchmakingClient } from '../features/matchmaking/client'
import { useSession } from './useSession'
import { safeReturnTo } from './returnTo'
import { AccountContext } from './account-context'

export function AccountBoundary({ children }: { children: ReactNode }) {
  const { session, ready } = useSession()
  if (!ready) return <main><p role="status">Loading session…</p></main>
  return <AccountLoader key={session?.user.id ?? 'guest'} session={session}>{children}</AccountLoader>
}

function AccountLoader({ session, children }: { session: Session | null; children: ReactNode }) {
  const [account, setAccount] = useState<Account>(emptyAccount)
  const [loaded, setLoaded] = useState(!session)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const mounted = useRef(true)
  const writing = useRef(false)
  const requestVersion = useRef(0)
  const { pathname, search } = useLocation()
  const token = useRef(session?.access_token)
  useEffect(() => { token.current = session?.access_token }, [session?.access_token])
  const reload = async () => {
    if (!token.current) return
    const version = ++requestVersion.current
    setError('')
    try {
      const saved = await matchmakingClient(token.current).account()
      if (mounted.current && version === requestVersion.current) { setAccount(saved); setLoaded(true) }
    } catch (failure) { if (mounted.current && version === requestVersion.current) setError(failure instanceof Error ? failure.message : 'Could not load your account.') }
  }
  useEffect(() => {
    mounted.current = true
    void reload()
    return () => { mounted.current = false }
    // Reload on identity change (the boundary is keyed), not on token refresh.
  }, [])
  const save = async (value: Account) => {
    if (!token.current || writing.current) return false
    writing.current = true; setBusy(true); setError('')
    ++requestVersion.current
    try {
      const saved = await matchmakingClient(token.current).saveAccount(value)
      if (!mounted.current) return false
      setAccount(saved)
      return true
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : 'Could not save your account.')
      return false
    } finally { writing.current = false; if (mounted.current) setBusy(false) }
  }
  // Auth/recovery pages must remain reachable even if account data is unavailable.
  const authPage = ['/login', '/register', '/auth/callback', '/forgot-password', '/reset-password'].includes(pathname)
  if (session && !loaded && !authPage) return <main className="pt-auth"><p role={error ? 'alert' : 'status'}>{error || 'Loading your account…'}</p>{error && <button onClick={() => void reload()}>Retry</button>}</main>
  if (session && loaded && account.completed.length < 4 && !authPage && pathname !== '/onboarding') {
    return <Navigate replace to={`/onboarding?${new URLSearchParams({ returnTo: safeReturnTo(pathname + search) ?? '/' })}`} />
  }
  return <AccountContext.Provider value={{ session, account, loaded, busy, error, save, reload }}>
    {session && error && <p className="pt-account-error" role="alert">{error}</p>}
    {children}
  </AccountContext.Provider>
}
