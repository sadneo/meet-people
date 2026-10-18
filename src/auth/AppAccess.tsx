import { useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { useSession } from './useSession'
import { centralSignInPath, safeReturnTo } from './returnTo'
import { useSharedUserProfile } from '../features/account/useSharedUserProfile'
import { ProfileIdentityForm } from '../features/account/ProfileIdentityForm'
import { isProfileReady } from '../../shared/profile-readiness'
import { MatchingSetup } from '../features/matchmaking/MatchingScreen'
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
  const data = useSharedUserProfile(session.access_token)
  const location = useLocation()
  const completing = location.pathname === '/onboarding'
  const destination = safeReturnTo(new URLSearchParams(location.search).get('returnTo')) ?? '/'
  const [started, setStarted] = useState(false)
  const [editingIdentity, setEditingIdentity] = useState(false)
  if (!data.loading && data.available && !started) setStarted(true)
  if (!data.loading && !data.error && isProfileReady(data.account, data.profile)) {
    return completing ? <Navigate replace to={destination} /> : <Outlet />
  }
  if (!data.loading && data.available && !data.error && !completing) {
    const target = safeReturnTo(`${location.pathname}${location.search}${location.hash}`) ?? '/'
    return <Navigate replace to={`/onboarding?${new URLSearchParams({ returnTo: target })}`} />
  }
  return <main className="pt-main pt-immersive pt-access-root"><section className="pt-access-card">
    <h1>{started && completing ? 'Complete onboarding' : data.loading ? 'Your account' : 'Profile unavailable'}</h1>
    {data.loading && <p role="status">Checking your profile…</p>}
    {started && completing && <>
      <p>Your real Profile, interests and free time are required before entering Pebble.</p>
      <ol aria-label="Onboarding progress"><li>{data.account ? 'Identity saved' : '1. Create your identity'}</li><li>2. Interests, birthdate, area and availability</li></ol>
      {!data.account || editingIdentity ? <ProfileIdentityForm account={data.account} enabled={data.canSaveIdentity} busy={data.busy} save={data.saveIdentity} onSaved={() => setEditingIdentity(false)} submitLabel="Save identity and continue" /> : <section><h2>Identity confirmed</h2><p>{data.account.display_name}</p><button type="button" className="pt-button pt-secondary" disabled={data.busy || data.loading} onClick={() => setEditingIdentity(true)}>Edit identity</button></section>}
      {data.account && data.profileKnown && <MatchingSetup token={session.access_token} initial={data.profile} busy={data.busy} error="" save={data.saveShared} presentation="profile" minimumRequired writesAvailable={data.canWrite} submitLabel="Finish onboarding" />}
    </>}
    {data.error && <p role="alert">{data.error}</p>}
    {data.error && <button type="button" className="pt-button pt-secondary" disabled={data.busy || data.loading} onClick={data.reload}>Retry profile</button>}
    <AccessAccountControls key={destination} session={session} recovery={new URL(destination, 'https://pebble.invalid').searchParams.get('credentials') === 'recovery'} />
  </section></main>
}

function AccessAccountControls({ session, recovery }: { session: NonNullable<ReturnType<typeof useSession>['session']>; recovery: boolean }) {
  const logout = useLogout()
  const [credentials, setCredentials] = useState(recovery)
  return <div className="pt-access-account"><button type="button" className="pt-button pt-secondary" aria-expanded={credentials} onClick={() => setCredentials(value => !value)}>Manage email &amp; password</button>
    {credentials && <AccountCredentials session={session} ready />}
    <button type="button" className="pt-button pt-secondary" disabled={logout.busy} onClick={() => void logout.logout()}>{logout.busy ? 'Logging out…' : 'Log out'}</button>{logout.error && <p role="alert">{logout.error}</p>}
  </div>
}
