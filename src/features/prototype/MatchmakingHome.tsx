import { useEffect, useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import { Icon } from './ui'
import { initialMatchProfile, loadMatchProfile, matchmakingProfileStorageKey, type MatchProfile } from './matchmaking-profile'
import './matchmaking.css'

function Button({ className = '', variant = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' }) {
  return <button className={`match-button match-button-${variant} ${className}`} type="button" {...props} />
}

function RecordCard({ className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return <article className={`match-record-card ${className}`} {...props} />
}

const placeOptions = ['Coffee shops', 'Parks & trails', 'Casual food', 'Campus events']
const weekDays = [
  { id: 'mon', short: 'Mon', full: 'Monday' }, { id: 'tue', short: 'Tue', full: 'Tuesday' },
  { id: 'wed', short: 'Wed', full: 'Wednesday' }, { id: 'thu', short: 'Thu', full: 'Thursday' },
  { id: 'fri', short: 'Fri', full: 'Friday' }, { id: 'sat', short: 'Sat', full: 'Saturday' },
  { id: 'sun', short: 'Sun', full: 'Sunday' },
]
const timeBlocks = [
  { id: 'morning', label: 'Morning', range: '8am–12pm' },
  { id: 'afternoon', label: 'Afternoon', range: '12–5pm' },
  { id: 'evening', label: 'Evening', range: '5–9pm' },
  { id: 'late', label: 'Late', range: '9pm–12am' },
]

function scheduleLabel(value: string) {
  const [dayId, blockId] = value.split('-')
  const day = weekDays.find((item) => item.id === dayId)
  const block = timeBlocks.find((item) => item.id === blockId)
  return day && block ? `${day.short} ${block.label.toLocaleLowerCase()}` : value
}

function MiniIcon({ kind }: { kind: 'spark' | 'clock' | 'pin' | 'place' }) {
  const paths = {
    spark: <path d="M12 3c.7 4.6 2.4 6.3 7 7-4.6.7-6.3 2.4-7 7-.7-4.6-2.4-6.3-7-7 4.6-.7 6.3-2.4 7-7Z" />,
    clock: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>,
    pin: <><path d="M18 10c0 4.5-6 10-6 10S6 14.5 6 10a6 6 0 1 1 12 0Z" /><circle cx="12" cy="10" r="2" /></>,
    place: <><path d="M5 20V9l7-5 7 5v11" /><path d="M8 20v-6h8v6M3 20h18" /></>,
  }
  return <svg aria-hidden="true" className="match-mini-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">{paths[kind]}</svg>
}


function AvailabilityGrid({ value, onChange }: { value: string[]; onChange: (schedule: string[]) => void }) {
  const paintValue = useRef<boolean | null>(null)
  const valueRef = useRef(value)

  useEffect(() => {
    valueRef.current = value
  }, [value])

  useEffect(() => {
    const stopPainting = () => { paintValue.current = null }
    window.addEventListener('pointerup', stopPainting)
    window.addEventListener('pointercancel', stopPainting)
    return () => {
      window.removeEventListener('pointerup', stopPainting)
      window.removeEventListener('pointercancel', stopPainting)
    }
  }, [])

  const setBlock = (id: string, selected: boolean) => {
    const current = valueRef.current
    const next = selected ? [...new Set([...current, id])] : current.filter((item) => item !== id)
    valueRef.current = next
    onChange(next)
  }

  return <fieldset className="match-availability"><legend>Free time</legend><div className="match-availability-help"><p>Tap or drag across the times that usually work.</p><button className="match-clear-schedule" disabled={value.length === 0} onClick={() => onChange([])} type="button">Clear times</button></div><div aria-label="Weekly availability" className="match-availability-grid" role="grid"><span aria-hidden="true" className="match-grid-corner" />{weekDays.map((day) => <span className="match-day-heading" key={day.id} role="columnheader"><b>{day.short.slice(0, 1)}</b><em>{day.short}</em></span>)}{timeBlocks.map((block) => <div className="match-time-row" key={block.id} role="row"><span className="match-time-heading" role="rowheader"><b>{block.label}</b><small>{block.range}</small></span>{weekDays.map((day) => {
    const id = `${day.id}-${block.id}`
    const selected = value.includes(id)
    return <button aria-label={`${day.full} ${block.label.toLocaleLowerCase()}`} aria-selected={selected} className={selected ? 'is-selected' : ''} key={id} onClick={(event) => { if (event.detail === 0) setBlock(id, !selected) }} onPointerDown={(event) => { event.preventDefault(); paintValue.current = !selected; setBlock(id, !selected) }} onPointerEnter={() => { if (paintValue.current !== null) setBlock(id, paintValue.current) }} role="gridcell" type="button"><span /></button>
  })}</div>)}</div></fieldset>
}

export function PreferencesPanel({ draft, onChange, onClose, onSave }: { draft: MatchProfile; onChange: (profile: MatchProfile) => void; onClose: () => void; onSave: () => void }) {
  const [interestInput, setInterestInput] = useState('')

  const toggle = (field: 'places', value: string) => {
    const selected = draft[field]
    onChange({ ...draft, [field]: selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value] })
  }

  const addInterest = () => {
    const interest = interestInput.trim()
    if (!interest || draft.interests.some((item) => item.toLocaleLowerCase() === interest.toLocaleLowerCase())) return
    onChange({ ...draft, interests: [...draft.interests, interest] })
    setInterestInput('')
  }

  const removeInterest = (interest: string) => {
    onChange({ ...draft, interests: draft.interests.filter((item) => item !== interest) })
  }

  return createPortal(<div className="match-preferences-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section aria-labelledby="preferences-title" aria-modal="true" className="match-preferences" role="dialog">
      <header><div><span>YOUR PROFILE</span><h2 id="preferences-title">Your preferences</h2></div><button aria-label="Close preferences" className="match-close-button" onClick={onClose} type="button">×</button></header>
      <div className="match-preferences-body">
        <div className="match-form-row">
          <label>Age<input aria-label="Age" inputMode="numeric" max="99" min="18" onChange={(event) => onChange({ ...draft, age: event.target.value })} type="number" value={draft.age} /></label>
          <label>Approximate area<input aria-label="Approximate area" onChange={(event) => onChange({ ...draft, area: event.target.value })} placeholder="Neighborhood or campus area" type="text" value={draft.area} /></label>
        </div>
        <label className="match-select-field">How far would you go?<select value={draft.distance} onChange={(event) => onChange({ ...draft, distance: event.target.value })}><option>Under 10 min</option><option>10–20 min</option><option>20–30 min</option><option>Anywhere nearby</option></select></label>
        <fieldset className="match-interest-editor"><legend>Interests</legend><div className="match-interest-input"><label><span className="sr-only">Add an interest</span><input aria-label="Add an interest" onChange={(event) => setInterestInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addInterest() } }} placeholder="Type an interest" type="text" value={interestInput} /></label><button disabled={!interestInput.trim()} onClick={addInterest} type="button">Add</button></div><div aria-label="Your interests" className="match-interest-tags">{draft.interests.map((item) => <span key={item}>{item}<button aria-label={`Remove ${item}`} onClick={() => removeInterest(item)} type="button">×</button></span>)}</div></fieldset>
        <AvailabilityGrid value={draft.schedule} onChange={(schedule) => onChange({ ...draft, schedule })} />
        <fieldset><legend>Places</legend><div className="match-option-grid">{placeOptions.map((item) => <label key={item}><input checked={draft.places.includes(item)} onChange={() => toggle('places', item)} type="checkbox" /><span>{item}</span></label>)}</div></fieldset>
      </div>
      <footer><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={onSave}>Save preferences</Button></footer>
    </section>
  </div>, document.body)
}

function PixelPebble({ x, y, mood = 'smile', small = false }: { x: number; y: number; mood?: 'smile' | 'open'; small?: boolean }) {
  return <g transform={`translate(${x} ${y}) scale(${small ? .72 : 1})`}>
    <path fill="#52744d" opacity=".2" d="M-4 43h54v7H-4z" />
    <path fill="#62675a" d="M8 0h22v4h8v7h6v9h5v22h-5v5H3v-5H0V20h4V9h4z" />
    <path fill="#bdb9a1" d="M10 4h18v4h8v7h5v25h-5v4H7v-4H4V21h4V11h2z" />
    <path fill="#ded7bf" d="M11 5h14v4H15v5h-6v9H6v-9h5zM31 33h8v6h-8z" />
    <path fill="#a19e88" d="M9 34h7v6H9zM29 13h5v5h-5zM21 6h4v4h-4z" />
    <path fill="#3f4538" d="M13 25h4v5h-4zM32 25h4v5h-4z" />
    {mood === 'smile' ? <path fill="#3f4538" d="M20 33h3v3h6v-3h3v6H20z" /> : <path fill="#3f4538" d="M22 33h8v7h-8z" />}
    <path fill="#d89379" d="M8 31h7v4H8zM35 31h6v4h-6z" />
  </g>
}

function MatchmakingScene({ matching }: { matching: boolean }) {
  return <svg aria-label={matching ? 'Pebble friends looking for another friend' : 'Three pebble friends meeting in a meadow'} className="match-pixel-scene" role="img" shapeRendering="crispEdges" viewBox="0 0 360 230">
    <rect width="360" height="230" rx="20" fill="#eef0df" />
    <g shapeRendering="crispEdges">
      <path fill="#fffaf0" opacity=".8" d="M22 40h20V28h34v8h28v16H22zM267 30h18V20h31v10h23v15h-72z" />
      <path fill="#d8dfb6" d="M0 94h35V82h47v8h44V74h50v14h48V78h46v12h50V75h40v55H0z" />
      <path fill="#b7c997" d="M0 112h55V99h54v12h67V96h68v15h58V98h58v56H0z" />
      <path fill="#9fbd7d" d="M0 132h360v98H0z" />
      <path fill="#91ad77" opacity=".35" d="M0 174h70v-7h75v8h85v-8h67v7h63v56H0z" />
      <path fill="#d8d3a0" d="M161 156h30v11h-12v12h-19v13h-22v14h-20v24H70v-13h17v-15h21v-15h22v-13h20v-11h11z" />
      <path fill="#e6dfb1" d="M166 157h15v9h-12v12h-17v13h-21v14h-19v14H92v11H77v-10h15v-14h18v-15h22v-14h20v-12h14z" />
      <path fill="#a18a60" d="M22 149h5v33h-5zM52 145h5v33h-5zM17 156l45-7v5l-45 7zM17 168l45-7v5l-45 7z" />
      <path fill="#c8b080" d="M23 150h2v31h-2zM53 146h2v31h-2z" />
      <path fill="#7ea267" d="M75 151h3v8h3v-12h3v15h-9zM285 169h3v8h3v-12h3v15h-9zM324 142h3v8h3v-11h3v14h-9z" />
      <path fill="#638753" d="M72 176h2v11h-2zM303 183h2v10h-2z" />
      <path fill="#fff6d8" d="M68 170h5v4h4v5h-4v4h-5v-4h-4v-5h4zM299 177h5v4h4v5h-4v4h-5v-4h-4v-5h4z" />
      <path fill="#e4b663" d="M69 174h4v5h-4zM300 181h4v5h-4z" />
      {matching ? <><PixelPebble x={132} y={133} /><PixelPebble x={190} y={137} small /><path fill="none" stroke="#647653" strokeWidth="4" d="M255 141h13m-18 12h10" /><path fill="#fff9ec" opacity=".72" d="M271 131h44v42h-44z" /><path fill="#647653" opacity=".42" d="M286 140h13v4h6v7h4v13h-5v4h-24v-4h-4v-13h4v-7h6z" /></> : <><PixelPebble x={110} y={137} small /><PixelPebble x={157} y={125} /><PixelPebble x={222} y={139} mood="open" small /></>}
    </g>
  </svg>
}

function MatchmakingHome() {
  const navigate = useNavigate()
  const [matching, setMatching] = useState(false)
  const [profile, setProfile] = useState(loadMatchProfile)
  const [draft, setDraft] = useState(initialMatchProfile)
  const [preferencesOpen, setPreferencesOpen] = useState(false)

  useEffect(() => {
    if (!preferencesOpen) return
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && setPreferencesOpen(false)
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [preferencesOpen])

  const openPreferences = () => {
    setDraft(profile)
    setPreferencesOpen(true)
  }

  const savePreferences = () => {
    setProfile(draft)
    localStorage.setItem(matchmakingProfileStorageKey, JSON.stringify(draft))
    setPreferencesOpen(false)
  }

  return <div className="match-home">
    <header className="match-topbar" aria-label="Matchmaking controls"><div className="match-topbar-actions"><button aria-label="Downtime matchmaking" className="match-mode-switch" onClick={() => navigate('/downtime-matchmaking')} type="button"><MiniIcon kind="clock" /><span>Downtime</span></button><button aria-label="Preferences" className="match-preferences-button" onClick={openPreferences} type="button"><Icon name="settings" /><span>Preferences</span></button></div></header>
    <section className="match-hero" aria-labelledby="match-title">
      <p className="match-mode-eyebrow"><span />Active matchmaking</p>
      <h1 id="match-title">Find your people</h1>
      <p className="match-lede">Shared interests. Free time. Nearby plans.</p>
      <div className="match-scene-wrap"><MatchmakingScene matching={matching} /><div aria-live="polite" className="match-scene-note" role="status"><strong>{matching ? 'Looking around...' : 'Ready when you are.'}</strong><span>{matching ? 'Finding a group...' : 'Groups of 3–5'}</span></div></div>
    </section>
    <RecordCard className="match-profile-card">
      <div className="match-card-heading"><h2>What brings you together</h2></div>
      <div className="match-profile-meta"><span>Age {profile.age}</span><span>{profile.area}</span></div>
      <div className="match-chip-list" aria-label="Selected interests">{profile.interests.map((interest) => <span key={interest}>{interest}</span>)}</div>
      <div className="match-detail-grid">
        <section aria-labelledby="schedule-heading" className="match-detail-block"><div className="match-detail-title"><MiniIcon kind="clock" /><h2 id="schedule-heading">Free time</h2></div><div className="match-schedule-summary">{profile.schedule.length ? profile.schedule.map((item) => <span key={item}>{scheduleLabel(item)}</span>) : <p>No times added yet</p>}</div></section>
        <section aria-labelledby="location-heading" className="match-detail-block"><div className="match-detail-title"><MiniIcon kind="pin" /><h2 id="location-heading">Nearby</h2></div><p>{profile.distance} from {profile.area}</p><small>Exact location stays private.</small></section>
      </div>
      <section aria-labelledby="places-heading" className="match-places"><div className="match-detail-title"><MiniIcon kind="place" /><h2 id="places-heading">Places</h2></div><div className="match-place-list">{profile.places.map((place) => <span key={place}><MiniIcon kind="spark" />{place}</span>)}</div></section>
    </RecordCard>
    <section className={`match-action-panel ${matching ? 'is-matching' : ''}`} aria-label="Start group matching"><div><strong>{matching ? 'Looking for your group' : 'Ready to look?'}</strong></div><Button variant={matching ? 'secondary' : 'primary'} onClick={() => setMatching((active) => !active)}>{matching ? 'Cancel search' : 'Start matching'}</Button><p>Preferences are saved on this device.</p></section>
    {preferencesOpen && <PreferencesPanel draft={draft} onChange={setDraft} onClose={() => setPreferencesOpen(false)} onSave={savePreferences} />}
  </div>
}

export default MatchmakingHome
