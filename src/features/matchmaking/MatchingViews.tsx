import { useAccount } from '../../auth/account-context'
import { calculatedAge } from '../account/profile-rules'
import { DatingPreferences } from './DatingPreferences'
import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type TouchEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router'
import type { MatchingMode } from '../../../shared/matchmaking'
import { MatchingNavigation, MatchingScreen } from './MatchingScreen'
import { isDatingView } from './views'
import { PixelPebble } from '../pebble-art/PixelArt'
import { datingPrototypeFixtures } from './dating-prototype-fixtures'
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
  const selector = <nav className="match-view-segments" aria-label="Matching views">
    <Link to={target('friends')} aria-current={!dating ? 'page' : undefined}><CardIcon name="friends" /><span>Friends</span></Link>
    <Link to={target('dating')} aria-current={dating ? 'page' : undefined}><CardIcon name="heart" /><span>Dating</span></Link>
  </nav>
  return <div className={`${mode === 'active' ? 'match-main-views' : 'match-home match-live match-calm'}${dating ? ' has-dating-deck' : mode === 'active' ? ' friends-page' : ''}`}>{!dating && <>{mode !== 'active' && <MatchingNavigation mode={mode} />}{selector}</>}{dating ? <DatingPrototype key={pathname} selector={selector} /> : mode === 'active' ? <MatchingScreen mode={mode} /> : <section className="match-focus downtime-compatibility" aria-labelledby="downtime-settings-title"><div className="pt-mascot-scene" aria-hidden="true"><PixelPebble /></div><h1 id="downtime-settings-title" tabIndex={-1}>Manage downtime in Settings</h1><p>Allow downtime matching in Settings. Only one Friends queue can be active at a time.</p><Link className="match-button match-button-secondary" to="/settings">Open matchmaking settings</Link></section>}</div>
}

type Decision = 'skip' | 'like' | 'star'
type FocusTarget = Decision | 'undo' | 'deck'
function CardIcon({ name }: { name: 'friends' | 'heart' | 'filter' | 'info' | 'undo' | 'x' | 'star' | 'pin' | 'distance' | 'height' }) {
  const paths = {
    pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2" /></>,
    distance: <><path d="m4 7 4-4 4 4M8 3v14a4 4 0 0 0 8 0V7m-4 4 4-4 4 4" /></>,
    height: <><path d="M8 3h10v18H8V3Zm5 4h5m-3 4h3m-5 4h5m-3 3h3" /></>,
    heart: <path d="M20 5c-3-3-6-1-8 1-2-2-5-4-8-1s-1 7 1 9l7 7 7-7c2-2 4-6 1-9Z" />,
    friends: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2m1-15a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v1" /></>,
    filter: <><path d="M3 6h7m4 0h7M3 12h12m4 0h2M3 18h3m4 0h11" /><circle cx="12" cy="6" r="2" /><circle cx="17" cy="12" r="2" /><circle cx="8" cy="18" r="2" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v.1" /></>,
    undo: <><path d="m8 4-5 5 5 5M3 9h10a7 7 0 0 1 0 14" /></>,
    x: <path d="m6 6 12 12M18 6 6 18" />,
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" />,
  }
  return <svg aria-hidden="true" data-icon={name} viewBox="0 0 24 24">{paths[name]}</svg>
}

function PrototypeDialog({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null), id = useId()
  useEffect(() => {
    const dialog = ref.current!, opener = document.activeElement
    dialog.showModal()
    return () => { dialog.close(); if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true }) }
  }, [])
  return createPortal(<dialog ref={ref} className="pt-dialog dating-prototype-dialog" aria-labelledby={id} onCancel={event => { event.preventDefault(); close() }}><h2 id={id}>{title}</h2>{children}<button type="button" aria-label="Close prototype dialog" onClick={close}>Close</button></dialog>, document.body)
}

function DatingPrototype({ selector }: { selector: ReactNode }) {
  const account = useAccount()
  const age = calculatedAge(account?.account.profile?.birthdate)
  const [cursor, setCursor] = useState(0)
  const [decision, setDecision] = useState<Decision | null>(null)
  const [history, setHistory] = useState<number[]>([])
  const [entering, setEntering] = useState(false)
  const [dialog, setDialog] = useState<'info' | 'filter' | null>(null)
  const locked = useRef(false)
  const focusAfter = useRef<FocusTarget | null>(null)
  const touch = useRef<{ x: number; y: number } | null>(null)
  const skip = useRef<HTMLButtonElement>(null), like = useRef<HTMLButtonElement>(null), star = useRef<HTMLButtonElement>(null), undo = useRef<HTMLButtonElement>(null), restart = useRef<HTMLButtonElement>(null), deck = useRef<HTMLDivElement>(null)
  const complete = cursor === datingPrototypeFixtures.length
  const fixture = datingPrototypeFixtures[cursor]
  const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  useEffect(() => {
    if (!decision) return
    const timer = window.setTimeout(() => { setHistory(value => [...value, cursor]); setCursor(value => value + 1); setDecision(null); setEntering(true); locked.current = false }, reducedMotion() ? 15 : 420)
    return () => window.clearTimeout(timer)
  }, [decision, cursor])
  useEffect(() => {
    if (!entering) return
    const timer = window.setTimeout(() => setEntering(false), reducedMotion() ? 0 : 300)
    return () => window.clearTimeout(timer)
  }, [entering, cursor])
  useEffect(() => {
    if (decision || !focusAfter.current) return
    const refs = { skip, like, star, undo, deck }
    const target = complete ? restart : refs[focusAfter.current]
    const element = target.current
    if (element instanceof HTMLButtonElement && element.disabled) deck.current?.focus({ preventScroll: true })
    else element?.focus({ preventScroll: true })
    focusAfter.current = null
  }, [cursor, decision, complete])
  const choose = (next: Decision, focus: FocusTarget = next) => {
    if (locked.current || complete || dialog) return
    setEntering(false)
    focusAfter.current = focus
    locked.current = true; setDecision(next)
  }
  const restore = () => {
    if (locked.current || dialog || !history.length) return
    setCursor(history[history.length - 1]); setHistory(value => value.slice(0, -1)); setEntering(true); focusAfter.current = 'undo'
  }
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (dialog || event.repeat || event.altKey || event.ctrlKey || event.metaKey || (event.target !== event.currentTarget && !(event.target instanceof Element && event.target.matches('[data-front]')))) return
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); choose(event.key === 'ArrowLeft' ? 'skip' : 'like', 'deck') }
  }
  const startTouch = (event: TouchEvent<HTMLDivElement>) => {
    touch.current = null
    if (dialog || complete || locked.current || (event.target instanceof Element && event.target.closest('button,a,input,select,textarea,[role="dialog"]'))) return
    const point = event.touches[0]
    if (point) touch.current = { x: point.clientX, y: point.clientY }
  }
  const endTouch = (event: TouchEvent<HTMLDivElement>) => {
    const start = touch.current, end = event.changedTouches[0]
    touch.current = null
    if (!start || !end) return
    const dx = end.clientX - start.x, dy = end.clientY - start.y
    if (Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 1.4) { event.preventDefault(); choose(dx < 0 ? 'skip' : 'like', 'deck') }
  }
  return <section className={`match-home match-calm dating-view${complete ? ' is-complete' : ''}`} aria-labelledby="dating-title" aria-describedby="dating-prototype-disclosure">
    <div className="dating-deck-focus">
      <header className="dating-overlay-header"><h1 id="dating-title" className="pt-sr-only" tabIndex={-1}>Dating in your downtime</h1>{selector}<button type="button" className="dating-filter" aria-label="Prototype preferences" aria-haspopup="dialog" disabled={!!decision} onClick={() => setDialog('filter')}><CardIcon name="filter" /></button></header>
      <p className={`dating-eligibility${account && (age === null || age < 18) ? '' : ' pt-sr-only'}`} role={account && (age === null || age < 18) ? 'status' : undefined}>{age === null ? 'Real Dating requires a confirmed birthdate and age of at least 18.' : age < 18 ? 'Real Dating is unavailable for accounts under 18.' : 'Adult age confirmed locally; real Dating is not connected.'}</p>
      <p id="dating-prototype-disclosure" className="dating-disclosure">Local prototype recommendations — not live Dating matches.</p>
      <p className="dating-progress" role="status" aria-live="polite">{complete ? 'Prototype complete' : `${datingPrototypeFixtures[cursor].name}, ${datingPrototypeFixtures[cursor].age} · ${cursor + 1} of ${datingPrototypeFixtures.length}`}</p>
      <p id="dating-deck-instructions" className="pt-sr-only">Fictional profiles and local decisions only. Focus the deck and use Left to pass or Right to preview a like. Swipe horizontally on the photo, or use the decision buttons. Undo restores your previous fixture. Nothing is sent or saved.</p>
      <div ref={deck} className="dating-stack" role="group" aria-label="Prototype recommendation stack" tabIndex={0} aria-describedby="dating-deck-instructions dating-prototype-disclosure" onKeyDown={keyboard} onTouchStart={startTouch} onTouchEnd={endTouch} onTouchCancel={() => { touch.current = null }}>
        {datingPrototypeFixtures.map((profile, index) => {
          if (index < cursor) return null
          const depth = index - cursor, front = depth === 0
          return <article key={profile.id} data-dating-card={profile.id} data-design="reference" data-presentation="photo" data-front={front ? 'true' : undefined} tabIndex={front ? -1 : undefined} className={`dating-card${front && decision ? decision === 'skip' ? ' is-skipping' : ' is-liking' : front && entering ? ' is-entering' : ''}`} style={{ '--card-depth': depth, zIndex: datingPrototypeFixtures.length - depth } as CSSProperties} aria-label={`${profile.name}, ${profile.age}, prototype recommendation`} aria-hidden={!front}>
            <img className="dating-portrait" src={profile.photo} alt="" draggable={false} decoding="async" />
            <span className="dating-photo-scrim" aria-hidden="true" />
            <div className="dating-card-copy"><div className="dating-eyebrow">Prototype profile</div><div className="dating-name-row"><h2 aria-label={`${profile.name}, ${profile.age}`}><span className="dating-name">{profile.name}</span><span className="dating-age">{profile.age}</span></h2><button type="button" className="dating-info" aria-label={`About ${profile.name}`} aria-haspopup="dialog" disabled={!front || !!decision} onClick={() => setDialog('info')}><CardIcon name="info" /></button></div><dl className="dating-card-info" aria-label="Fictional profile details">
              <div><dt className="pt-sr-only">Sample location</dt><dd><CardIcon name="pin" />{profile.location}</dd></div>
              <div><dt className="pt-sr-only">Sample distance</dt><dd><CardIcon name="distance" />{profile.distance}</dd></div>
              <div><dt className="pt-sr-only">Sample height</dt><dd><CardIcon name="height" />{profile.height}</dd></div>
            </dl><ul aria-label="Prototype interests">{profile.interests.map((interest, tag) => <li key={interest}><span aria-hidden="true">{['✧', '♧', '♡'][tag % 3]}</span>{interest}</li>)}</ul>
            </div>
          </article>
        })}
        <div className="dating-complete" data-complete={complete} aria-hidden={!complete}><span className="dating-complete-mark" aria-hidden="true">✓</span><h2>You’ve explored the prototype</h2><p>No likes were sent. Nothing was saved.</p><button ref={restart} type="button" className="match-button match-button-secondary" disabled={!complete} onClick={() => { focusAfter.current = 'skip'; setHistory([]); setEntering(true); setCursor(0) }}>Restart prototype</button></div>
      </div>
      <div className="dating-decisions" role="group" aria-label="Recommendation decisions">
        <button ref={undo} type="button" className="dating-action dating-undo" aria-label="Undo local decision" title="Undo local decision" disabled={!!decision || !history.length} onClick={restore}><CardIcon name="undo" /></button>
        <button ref={skip} type="button" className="dating-action dating-skip" aria-label="Skip recommendation" aria-describedby="dating-prototype-disclosure" disabled={complete || !!decision} onClick={() => choose('skip')}><CardIcon name="x" /></button>
        <button ref={star} type="button" className="dating-action dating-star" aria-label="Star prototype recommendation, local only" title="Star — local preview only" aria-describedby="dating-prototype-disclosure" disabled={complete || !!decision} onClick={() => choose('star')}><CardIcon name="star" /></button>
        <button ref={like} type="button" className="dating-action dating-like" aria-label="Like recommendation" aria-describedby="dating-prototype-disclosure" disabled={complete || !!decision} onClick={() => choose('like')}><CardIcon name="heart" /></button>
      </div>
      <small className="dating-account-note pt-sr-only"><span>Same Pebble account. Your Friends queue stays as it is.</span><span>Decisions reset when you leave or reload.</span></small>
    </div>
    <DatingPreferences open={dialog === 'filter'} close={() => setDialog(null)} />
    {dialog === 'info' && <PrototypeDialog title={`About ${fixture.name} — prototype profile`} close={() => setDialog(null)}><p>{fixture.longBio}</p></PrototypeDialog>}
  </section>
}
