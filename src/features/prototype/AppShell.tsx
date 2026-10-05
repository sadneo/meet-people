import { useEffect, useRef } from 'react'
import { Link, Outlet, useLocation } from 'react-router'
import { usePrototype } from './context'
import { scenePaths, type Scene } from './model'
import { Avatar, Brand, Icon, Pebble } from './ui'

const primaryTabs: { label: Scene; icon: string }[] = [
  { label: 'Home', icon: 'home' },
  { label: 'Matchmaking', icon: 'matchmaking' },
  { label: 'Events', icon: 'events' },
  { label: 'Messages', icon: 'messages' },
]

function Tab({ label, icon, active }: { label: Scene; icon: string; active: boolean }) {
  return <Link to={scenePaths[label]} className={active ? 'is-active' : ''} aria-current={active ? 'page' : undefined}>{label === 'Home' ? <Pebble /> : <Icon name={icon} />}<span>{label}</span></Link>
}

export function AppShell() {
  const { scene, state } = usePrototype()
  const { pathname } = useLocation()
  const main = useRef<HTMLElement>(null)
  const account = useRef<HTMLDetailsElement>(null)
  const activeTab: Scene = scene === 'Event Detail' ? 'Events' : scene === 'Downtime Matchmaking' ? 'Matchmaking' : ['Free Time Match', 'Activities', 'Planning', 'Review', 'Confirmed', 'Connection'].includes(scene) ? 'Free Time' : scene === 'Chat' ? 'Messages' : ['Other User Profile', 'Settings'].includes(scene) ? 'Profile' : scene

  useEffect(() => {
    if (account.current) account.current.open = false
    main.current?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true })
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname])

  useEffect(() => {
    const dismiss = (event: PointerEvent | KeyboardEvent) => {
      if (!account.current?.open) return
      if (event instanceof KeyboardEvent) {
        if (event.key !== 'Escape') return
        account.current.querySelector('summary')?.focus()
      } else if (account.current.contains(event.target as Node)) return
      account.current.open = false
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', dismiss)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', dismiss)
    }
  }, [])

  return <>
    <header className="pt-app-header">
      <Link className="pt-logo-link" to="/" aria-label="Pebble home"><Brand /></Link>
      <nav className="pt-desktop-nav" aria-label="Primary navigation">{primaryTabs.map(tab => <Tab key={tab.label} {...tab} active={activeTab === tab.label} />)}</nav>
      <nav className="pt-account-nav" aria-label="Account navigation">
        <details ref={account} className="pt-account-dropdown" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false }}>
          <summary role="button" aria-label="Account menu"><Avatar person={state.profile} /></summary>
          <div className="pt-account-options" onClick={() => { if (account.current) account.current.open = false }}>
            <Tab label="Profile" icon="profile" active={activeTab === 'Profile' && scene !== 'Settings'} />
            <Tab label="Settings" icon="settings" active={scene === 'Settings'} />
            <Link to={scenePaths.Login}>Log out</Link>
          </div>
        </details>
      </nav>
    </header>
    <main ref={main} className="pt-main"><Outlet /></main>
    <nav className="pt-bottom-nav" aria-label="Primary navigation">{[...primaryTabs, { label: 'Profile' as Scene, icon: 'profile' }].map(tab => <Tab key={tab.label} {...tab} active={activeTab === tab.label} />)}</nav>
  </>
}
