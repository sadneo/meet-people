import { useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { getLocalDevelopmentEnvironment, isLocalDevelopment } from '../auth/localDevelopment'

const views = [
  { group: 'Public', pages: [['Landing page', '/welcome'], ['Sign in', '/login'], ['Register', '/register'], ['Password recovery', '/forgot-password'], ['Guest events', '/explore']] },
  { group: 'App', pages: [['Garden', '/home'], ['Discover', '/matchmaking'], ['Events', '/events'], ['Messages', '/messages'], ['Requests', '/messages/requests'], ['Profile', '/profile'], ['Settings', '/settings'], ['Activity / Matches', '/activity'], ['Onboarding', '/onboarding']] },
  { group: 'Legal', pages: [['Privacy', '/privacy'], ['Terms', '/terms'], ['Cookies', '/cookies']] },
]

export default function DevelopmentNavigator() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const details = useRef<HTMLDetailsElement>(null)
  const summary = useRef<HTMLElement>(null)
  if (import.meta.env.VITE_DEV_TOOLS !== 'true' && !isLocalDevelopment(getLocalDevelopmentEnvironment())) return null
  const build = [import.meta.env.VITE_BUILD_BRANCH, import.meta.env.VITE_BUILD_SHA?.slice(0, 7)].filter(Boolean).join(' · ')
  function jump(path: string) {
    if (!views.some(group => group.pages.some(([, route]) => route === path))) return
    if (details.current) details.current.open = false
    summary.current?.focus()
    navigate(path)
  }
  return (
    <aside className="development-navigator" aria-label="Development navigation">
      <details ref={details} onKeyDown={event => {
        if (event.key === 'Escape') {
          event.currentTarget.open = false
          summary.current?.focus()
        }
      }}>
        <summary ref={summary}>
          <span className="devdot" aria-hidden="true" />
          <b>DEV</b><span className="devcurrent">View navigator</span>
          <span className="devchevron" aria-hidden="true">⌃</span>
        </summary>
        <div className="devpanel">
          <div className="devtitle"><b>Pebble · UI review</b><small>{build || 'Live app'} · Changes may be saved</small></div>
          <label htmlFor="dev-view">Jump to a view</label>
          <select id="dev-view" value={views.some(group => group.pages.some(([, route]) => route === pathname)) ? pathname : ''} onChange={event => jump(event.target.value)}>
            <option value="" disabled>Choose a screen…</option>
            {views.map(group => <optgroup key={group.group} label={group.group}>
              {group.pages.map(([label, path]) => <option key={path} value={path}>{label}</option>)}
            </optgroup>)}
          </select>
          <small className="devhint">Private views require sign-in. This navigator does not bypass account setup.</small>
          <div className="devquick">
            {[['Landing page', '/welcome'], ['Sign in', '/login'], ['Discover', '/matchmaking'], ['Garden', '/home']].map(([label, path]) => <button key={path} type="button" onClick={() => jump(path)}>{label}</button>)}
          </div>
        </div>
      </details>
    </aside>
  )
}
