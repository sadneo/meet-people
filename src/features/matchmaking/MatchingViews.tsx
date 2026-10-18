import { Link, useLocation } from 'react-router'
import type { MatchingMode } from '../../../shared/matchmaking'
import { MatchingNavigation, MatchingScreen } from './MatchingScreen'
import { isDatingView } from './views'
import { PixelPebble } from '../pebble-art/PixelArt'
import './dating-views.css'

export function MatchingViews({ mode }: { mode: MatchingMode }) {
  const { pathname, search } = useLocation()
  const dating = isDatingView(pathname, search)
  const target = (view: 'friends' | 'dating') => {
    const query = new URLSearchParams(search)
    if (view === 'dating') query.set('view', view)
    else query.delete('view')
    return `${pathname}${query.size ? `?${query}` : ''}`
  }
  return <div className={mode === 'active' ? 'match-main-views' : 'match-home match-live match-calm'}>{mode !== 'active' && <MatchingNavigation mode={mode} />}<nav className="match-view-segments" aria-label="Matching views">
    <Link to={target('friends')} aria-current={!dating ? 'page' : undefined}>Friends</Link>
    <Link to={target('dating')} aria-current={dating ? 'page' : undefined}>Dating</Link>
  </nav>{dating ? <section className="match-home match-calm dating-view" aria-labelledby="dating-title">
    <div className="match-focus dating-focus">
      <div className="pt-mascot-scene dating-mascot" aria-hidden="true">
        <PixelPebble />
        <span className="dating-heart-thought" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M16 27 5 16C-2 8 9 1 16 10c7-9 18-2 11 6Z" /></svg></span>
      </div>
      <div className="dating-copy"><h1 id="dating-title" tabIndex={-1}>Dating in your downtime</h1><p>Free time in common, room for a little spark.</p></div>
      <div className="match-focus-actions">
        <button className="match-button match-button-primary" disabled aria-describedby="dating-backend-status">Find a date in your downtime</button>
        <p id="dating-backend-status" className="dating-backend-status" role="status">Dating backend not connected</p>
      </div>
      <small>Your Friends queue stays as it is.</small>
    </div>
  </section> : mode === 'active' ? <MatchingScreen mode={mode} /> : <section className="match-focus downtime-compatibility" aria-labelledby="downtime-settings-title"><div className="pt-mascot-scene" aria-hidden="true"><PixelPebble /></div><h1 id="downtime-settings-title" tabIndex={-1}>Manage downtime in Settings</h1><p>Allow downtime matching in Settings. Only one Friends queue can be active at a time.</p><Link className="match-button match-button-secondary" to="/settings">Open matchmaking settings</Link></section>}</div>
}
