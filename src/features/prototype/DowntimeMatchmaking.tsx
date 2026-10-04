import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button, Icon, Pebble } from './ui'
import { PreferencesPanel } from './MatchmakingHome'
import { initialMatchProfile, loadMatchProfile, matchmakingProfileStorageKey } from './matchmaking-profile'
import './downtime-matchmaking.css'
const downtimeStorageKey = 'pebble.downtime-matching'

const dayLabels: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' }
const timeLabels: Record<string, string> = { morning: 'morning', afternoon: 'afternoon', evening: 'evening', late: 'late' }


function scheduleLabel(value: string) {
  const [day, time] = value.split('-')
  return dayLabels[day] && timeLabels[time] ? `${dayLabels[day]} ${timeLabels[time]}` : value
}

function DowntimeScene({ active }: { active: boolean }) {
  return <div className={`downtime-scene ${active ? 'is-active' : ''}`} aria-label={active ? 'Pebble quietly looking for compatible groups overnight' : 'Pebble resting beneath the moon'} role="img">
    <span className="downtime-moon" />
    <span className="downtime-cloud one" /><span className="downtime-cloud two" />
    <span className="downtime-hill far" /><span className="downtime-hill near" />
    <span className="downtime-star a">✦</span><span className="downtime-star b">✦</span><span className="downtime-star c">·</span>
    <Pebble expression={active ? 'happy' : 'neutral'} className="downtime-pebble" />
    {active && <><span className="downtime-signal one" /><span className="downtime-signal two" /><Pebble expression="neutral" className="downtime-candidate first" /><Pebble expression="neutral" className="downtime-candidate second" /></>}
  </div>
}

function DowntimeMatchmaking() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(loadMatchProfile)
  const [draft, setDraft] = useState(initialMatchProfile)
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [active, setActive] = useState(() => localStorage.getItem(downtimeStorageKey) === 'true')

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

  const toggle = () => {
    const next = !active
    setActive(next)
    localStorage.setItem(downtimeStorageKey, String(next))
  }

  return <div className="downtime-page">
    <div className="downtime-controls" aria-label="Downtime matchmaking controls">
      <button aria-label="Active matchmaking" className="downtime-mode-switch" onClick={() => navigate('/matchmaking')} type="button"><Icon name="profile" /> Active matching</button>
      <button aria-label="Preferences" className="downtime-preferences-button" onClick={openPreferences} type="button"><Icon name="settings" /> Preferences</button>
    </div>
    <header className="downtime-hero">
      <p className="downtime-eyebrow"><span /> Downtime matchmaking</p>
      <h1>Meet people, even while you’re away</h1>
      <p className="downtime-lede">Set your preferences once. Pebble can quietly look for a comfortable group while you get on with your day.</p>
    </header>

    <DowntimeScene active={active} />

    <section className={`downtime-status-card ${active ? 'is-active' : ''}`} aria-labelledby="downtime-status-title">
      <div className="downtime-status-copy">
        <span className="downtime-status-icon"><Icon name={active ? 'check' : 'time'} /></span>
        <div><p>{active ? 'LOOKING IN THE BACKGROUND' : 'READY WHEN YOU ARE'}</p><h2 id="downtime-status-title">{active ? 'Downtime matching is on' : 'Let Pebble look while you’re away'}</h2><span>{active ? 'We’ll keep this demo search running on this device.' : 'Turn it on, then come back whenever it suits you.'}</span></div>
      </div>
      <Button onClick={toggle}>{active ? 'Pause downtime matching' : 'Turn on downtime matching'}</Button>
      <p className="downtime-local-note">This demo is simulated on this device. No backend matching or notifications are active.</p>
      <output className="pt-sr-only" role="status" aria-live="polite">{active ? 'Downtime matching is on' : 'Downtime matching is paused'}</output>
    </section>

    <section className="downtime-section" aria-labelledby="downtime-how-title">
      <div className="downtime-section-heading"><p>HOW A MATCH COMES TOGETHER</p><h2 id="downtime-how-title">The same signals, with less urgency.</h2></div>
      <div className="downtime-criteria">
        <article><span><Icon name="profile" /></span><h3>Shared interests</h3><p>Look for people who enjoy some of the same things.</p></article>
        <article><span><Icon name="time" /></span><h3>Overlapping free time</h3><p>Prefer groups whose usual availability lines up.</p></article>
        <article><span><Icon name="pin" /></span><h3>Nearby places</h3><p>Keep suggestions inside your chosen travel range.</p></article>
      </div>
    </section>

    <section className="downtime-profile" aria-labelledby="downtime-profile-title">
      <div className="downtime-profile-heading"><div><p>YOUR MATCHING PROFILE</p><h2 id="downtime-profile-title">What Pebble will use</h2></div><span>Shared with active matching</span></div>
      <div className="downtime-profile-meta"><strong>Age {profile.age}</strong><span>{profile.area}</span><span>{profile.distance}</span></div>
      <div className="downtime-profile-grid">
        <div><h3>Interests</h3><div className="downtime-tags">{profile.interests.map(item => <span key={item}>{item}</span>)}</div></div>
        <div><h3>Usually free</h3><div className="downtime-tags compact">{profile.schedule.map(item => <span key={item}>{scheduleLabel(item)}</span>)}</div></div>
        <div className="downtime-places"><h3>Comfortable places</h3><div className="downtime-tags">{profile.places.map(item => <span key={item}>{item}</span>)}</div></div>
      </div>
    </section>
    {preferencesOpen && <PreferencesPanel draft={draft} onChange={setDraft} onClose={() => setPreferencesOpen(false)} onSave={savePreferences} />}
  </div>
}

export default DowntimeMatchmaking
