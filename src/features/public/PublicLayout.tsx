import { useEffect, useRef } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { useSession } from '../../auth/useSession'
import { publicAuthPath } from './links'
import { Brand } from '../prototype/ui'
import { AppShell } from '../prototype/AppShell'
import { Home } from '../prototype/Home'
import PebbleApp from '../../routes/PebbleApp'
import { MarketingPage } from './MarketingPage'
import { isEventDetailPath } from '../events/routes'
import './public.css'

// Guest pages do not mount prototype state, developer controls or the account loader.
// Signed-in visitors retain the existing account/onboarding boundary and app shell.
export function PublicOrAppLayout() {
  const { session, ready } = useSession()
  const { pathname } = useLocation()
  if (!ready) return <div className="pt-app public-loading" role="status">Opening Pebble…</div>
  const publicRoute = pathname === '/' || pathname === '/events' || isEventDetailPath(pathname)
  return !session && publicRoute ? <PublicLayout /> : <PebbleApp />
}

export function MemberShell() {
  const { session } = useSession()
  const { pathname } = useLocation()
  const publicRoute = pathname === '/' || pathname === '/events' || isEventDetailPath(pathname)
  return !session && publicRoute ? <Outlet /> : <AppShell />
}

export function HomeEntry() {
  const { session } = useSession()
  return session ? <Home /> : <MarketingPage />
}

export function PublicLayout() {
  const { session } = useSession()
  const { pathname } = useLocation()
  const main = useRef<HTMLElement>(null)
  useEffect(() => {
    window.scrollTo(0, 0)
    main.current?.focus({ preventScroll: true })
    const title = ({ '/': 'Find a little time in common', '/terms': 'Terms of Service', '/privacy': 'Privacy Policy', '/cookies': 'Cookie Policy' } as Record<string, string>)[pathname] ?? 'Events'
    document.title = `${title} | Pebble`
  }, [pathname])
  return <div className="pt-app public-site">
    <a className="public-skip" href="#public-content">Skip to content</a>
    <header className="public-header public-width">
      <Link to="/" aria-label="Pebble home"><Brand /></Link>
      <nav aria-label="Public navigation">
        <NavLink to="/events">Explore events</NavLink>
        {session ? <Link className="pt-button pt-discovery-action" to="/">Open Pebble</Link> : <><Link to={publicAuthPath('login')}>Sign in</Link><Link className="pt-button pt-discovery-action" to={publicAuthPath('register')}>Get started</Link></>}
      </nav>
    </header>
    <main id="public-content" ref={main} tabIndex={-1} className="public-main public-width"><Outlet /></main>
    <footer className="public-footer public-width">
      <div><Link to="/" aria-label="Pebble home"><Brand /></Link><p>A little time. A new connection.</p></div>
      <nav aria-label="Footer navigation"><Link to="/terms">Terms of Service</Link><Link to="/privacy">Privacy Policy</Link><Link to="/cookies">Cookie Policy</Link><Link to={publicAuthPath('login')}>Sign in</Link></nav>
    </footer>
  </div>
}
