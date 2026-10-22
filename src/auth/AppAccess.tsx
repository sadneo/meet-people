import { useEffect, useRef, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { useSession } from './useSession'
import { centralSignInPath, safeReturnTo } from './returnTo'
import { useUnifiedAccount } from './useUnifiedAccount'
import { completedAccountChapters } from '../../shared/account'
import { AccountContext } from './account-context'
import { RegistrationOnboarding } from './RegistrationOnboarding'
import { AccountCredentials } from './AccountCredentials'
import { useLogout } from './useLogout'
import './app-access.css'

// This boundary mounts before the private shell, prototype context or data hooks.
export function PublicAuthLayout() { return <main className="pt-main pt-immersive pt-access-root"><Outlet /></main> }

export function SessionRequired() {
  const { ready, session } = useSession()
  const { pathname, search, hash } = useLocation()
  if (!ready) return <main className="pt-main pt-immersive pt-access-root"><p role="status">Loading session…</p></main>
  const completing = ['/complete-profile', '/onboarding'].includes(pathname)
  const requested = completing ? safeReturnTo(new URLSearchParams(search).get('returnTo')) ?? '/' : `${pathname}${search}${hash}`
  if (!session?.user?.id || !session.access_token) return <Navigate replace to={centralSignInPath(requested)} />
  if (pathname === '/complete-profile') return <Navigate replace to={`/onboarding?${new URLSearchParams({ returnTo: requested })}`} />
  return <CanonicalAccess key={`${session.user.id}:${session.access_token}`} session={session} />
}

function CanonicalAccess({ session }: { session: NonNullable<ReturnType<typeof useSession>['session']> }) {
  const data = useUnifiedAccount(session.access_token)
  const location = useLocation()
  const completing = location.pathname === '/onboarding'
  const destination = safeReturnTo(new URLSearchParams(location.search).get('returnTo')) ?? '/'
  const [started, setStarted] = useState(false)
  const route = `${location.pathname}${location.search}${location.hash}`
  const [focus, setFocus] = useState<{ target: 'matching-preferences'; route: string } | null>(null)
  if (focus && focus.route !== route) setFocus(null)
  if (!data.loading && data.available && !started) setStarted(true)
  if (!data.loading && data.available && !data.error && data.account && completedAccountChapters(data.account).length === 4) {
    return completing ? <Navigate replace to={destination} /> : <AccountContext.Provider value={{ session, account: data.account, loaded: true, busy: data.busy, error: data.error, save: data.save, reload: options => { setFocus(options?.restoreFocus ? { target: options.restoreFocus, route } : null); data.reload() }, focusTarget: focus?.route === route ? focus.target : undefined, focusRestored: () => setFocus(null) }}><Outlet /></AccountContext.Provider>
  }
  if (!data.loading && data.available && !data.error && !completing) {
    const target = safeReturnTo(`${location.pathname}${location.search}${location.hash}`) ?? '/'
    return <Navigate replace to={`/onboarding?${new URLSearchParams({ returnTo: target })}`} />
  }
  if (!started && data.error && !data.loading) return <AccountLoadFailure />
  return <main className="pt-main pt-immersive pt-access-root"><section className="pt-access-card">
    <h1>{started && completing ? 'Complete onboarding' : data.loading ? 'Your account' : 'Profile unavailable'}</h1>
    {data.loading && <p role="status">Checking your profile…</p>}
    {started && completing && <>
      <p>Your real Profile and preferences are saved one chapter at a time.</p>
      {data.account && <RegistrationOnboarding account={data.account} token={session.access_token} busy={data.busy} enabled={data.available && !data.loading} save={data.save} />}
    </>}
    {data.error && <p role="alert">{data.error}</p>}
    {data.error && <button type="button" className="pt-button pt-secondary" disabled={data.busy || data.loading} onClick={data.reload}>Retry account</button>}
    <AccessAccountControls key={destination} session={session} recovery={new URL(destination, 'https://pebble.invalid').searchParams.get('credentials') === 'recovery'} />
  </section></main>
}

function AccountLoadFailure() {
  const { logout, error } = useLogout()
  const attempted = useRef(false)
  useEffect(() => {
    if (attempted.current) return
    attempted.current = true
    void logout('account-unavailable')
  }, [logout])
  return <main className="pt-main pt-immersive pt-access-root"><section className="pt-auth pt-auth-email-first"><p role={error ? 'alert' : 'status'}>{error || 'Returning to sign in…'}</p>{error && <button className="pt-button" onClick={() => void logout('account-unavailable')}>Return to sign in</button>}</section></main>
}

function AccessAccountControls({ session, recovery }: { session: NonNullable<ReturnType<typeof useSession>['session']>; recovery: boolean }) {
  const logout = useLogout()
  const [credentials, setCredentials] = useState(recovery)
  return <div className="pt-access-account"><button type="button" className="pt-button pt-secondary" aria-expanded={credentials} onClick={() => setCredentials(value => !value)}>Manage email &amp; password</button>
    {credentials && <AccountCredentials session={session} ready />}
    <button type="button" className="pt-button pt-secondary" disabled={logout.busy} onClick={() => void logout.logout()}>{logout.busy ? 'Logging out…' : 'Log out'}</button>{logout.error && <p role="alert">{logout.error}</p>}
  </div>
}
