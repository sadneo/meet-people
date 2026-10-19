import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { Brand, Pebble } from './ui'
import { EmailLinkSignIn } from '../../auth/EmailLinkSignIn'
import { useSession } from '../../auth/useSession'
import { safeReturnTo } from '../../auth/returnTo'

// The former prototype onboarding is superseded by the authoritative pre-shell
// four-chapter flow. Keep one verified auth-entry lifecycle, not a second AuthScreen.
function AuthEntry({ session, returnTo, register }: { session: ReturnType<typeof useSession>['session']; returnTo: string | null; register: boolean }) {
  const [signedIn] = useState(!!session)
  const [arrivalUrl] = useState(() => window.location.href)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  useEffect(() => {
    const entryRoute = ['/login', '/register'].includes(pathname.toLowerCase().replace(/\/+$/, ''))
    if (entryRoute && signedIn && session && window.location.href === arrivalUrl) navigate(returnTo ?? '/', { replace: true })
  }, [signedIn, session, returnTo, arrivalUrl, navigate, pathname])
  return signedIn && session ? <><p>You are signed in.</p><Link to="/matchmaking">Go to matchmaking</Link></> : <EmailLinkSignIn register={register} />
}
export function Auth({ register = false }: { register?: boolean }) {
  const { session, ready } = useSession()
  const { search, key } = useLocation()
  const returnTo = safeReturnTo(new URLSearchParams(search).get('returnTo'))
  return <section className="pt-auth"><Brand /><div className="pt-auth-form"><h1>{register ? 'Create an account' : 'Sign in'}</h1>{!ready ? <p role="status">Loading session…</p> : <AuthEntry key={key} session={session} returnTo={returnTo} register={register} />}<Link to={`${register ? '/login' : '/register'}${returnTo ? `?${new URLSearchParams({ returnTo })}` : ''}`}>{register ? 'Sign in' : 'Create an account'}</Link></div><span className="pt-curious" aria-hidden="true"><Pebble /></span></section>
}
