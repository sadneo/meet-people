import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import type { Session } from '@supabase/supabase-js'
import { emptyAccount, type Account } from '../../shared/account'
import { MatchmakingClientError, matchmakingClient } from '../features/matchmaking/client'
import { useSession } from './useSession'
import { centralSignInPath, safeReturnTo } from './returnTo'
import { AccountContext } from './account-context'
import { supabase } from '../supabase'

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
  const navigate = useNavigate()
  const signIn = useRef({ navigate, path: '/login' })
  const token = useRef(session?.access_token)
  useEffect(() => { token.current = session?.access_token }, [session?.access_token])
  useEffect(() => {
    signIn.current = { navigate, path: centralSignInPath(safeReturnTo(pathname + search) ?? safeReturnTo(new URLSearchParams(search).get('returnTo')) ?? '/') }
  }, [navigate, pathname, search])
  const recoverSession = async (failure: unknown, failedToken: string, version: number) => {
    if (!(failure instanceof MatchmakingClientError) || failure.status !== 401 || !supabase) return false
    const { data, error: sessionError } = await supabase.auth.getSession()
    if (!mounted.current || version !== requestVersion.current) return true
    if (sessionError) return false
    if (data.session && data.session.access_token !== failedToken) {
      // A response for the previous token must not clear a refreshed session.
      token.current = data.session.access_token
      await reload()
      return true
    }
    const { error: logoutError } = await supabase.auth.signOut({ scope: 'local' })
    if (logoutError) {
      if (mounted.current) setError('Your session has expired. Could not sign out; please try again.')
    } else {
      // SIGNED_OUT unmounts this account before navigation completes.
      signIn.current.navigate(signIn.current.path, { replace: true })
    }
    return true
  }
  const reload = async () => {
    if (!token.current) return
    const requestToken = token.current
    const version = ++requestVersion.current
    setError('')
    try {
      const saved = await matchmakingClient(requestToken).account()
      if (mounted.current && version === requestVersion.current) { setAccount(saved); setLoaded(true) }
    } catch (failure) {
      if (!mounted.current || version !== requestVersion.current) return
      if (!await recoverSession(failure, requestToken, version)) setError(failure instanceof Error ? failure.message : 'Could not load your account.')
    }
  }
  const loadOnMount = useEffectEvent(() => { void reload() })
  useEffect(() => {
    mounted.current = true
    loadOnMount()
    return () => { mounted.current = false }
    // Reload on identity change (the boundary is keyed), not on token refresh.
  }, [])
  const save = async (value: Account) => {
    if (!token.current || writing.current) return false
    const requestToken = token.current
    writing.current = true; setBusy(true); setError('')
    const version = ++requestVersion.current
    try {
      const saved = await matchmakingClient(requestToken).saveAccount(value)
      if (!mounted.current) return false
      setAccount(saved)
      return true
    } catch (failure) {
      if (mounted.current && version === requestVersion.current && !await recoverSession(failure, requestToken, version)) setError(failure instanceof Error ? failure.message : 'Could not save your account.')
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
