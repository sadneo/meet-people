import { useState, type FormEvent } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { hasBasicProfile, SaveAccountSchema } from '../../shared/account'
import { safeReturnTo } from '../auth/returnTo'
import { ActionButton, Brand, ErrorMessage } from './common'
import { useCurrent } from './current'
import { useAction } from './hooks'
import { meetsMinimumAge } from './age-visibility'
import { deviceTimeZone } from '../features/account/timezones'
import './onboarding.css'

export function Onboarding() {
  const current = useCurrent()
  const [search] = useSearchParams()
  const action = useAction()
  const account = current.account!
  const saved = account.profile
  const [displayName, setDisplayName] = useState(saved?.display_name ?? '')
  const [username, setUsername] = useState(saved?.username ?? '')
  const [year, setYear] = useState(saved?.birthdate?.slice(0, 4) ?? '')
  const [month, setMonth] = useState(saved?.birthdate?.slice(5, 7) ?? '')
  const [day, setDay] = useState(saved?.birthdate?.slice(8, 10) ?? '')
  const destination = safeReturnTo(search.get('returnTo')) ?? '/'
  const busy = current.busy || current.loading || action.busy

  if (hasBasicProfile(saved)) return <Navigate replace to={destination}/>

  async function submit(event: FormEvent) {
    event.preventDefault()
    await action.run(async () => {
      const birthdate = [year, month.padStart(2, '0'), day.padStart(2, '0')].join('-')
      const next = SaveAccountSchema.safeParse({
        ...account,
        initialTimeZone: deviceTimeZone(),
        profile: {
          bio: null, location_city: null, avatar_url: null, interests: [], availability: [],
          ...saved, display_name: displayName, username, birthdate,
        },
        completed: account.completed.length ? account.completed : [0],
      })
      if (!next.success) {
        const issue = next.error.issues[0]
        throw new Error(issue?.path.includes('birthdate') ? 'Enter a valid birthday.' : issue?.message ?? 'Check your name and birthday.')
      }
      if (!meetsMinimumAge(birthdate)) throw new Error('You must be at least 18 to use Pebble.')
      await current.save(next.data)
    })
  }

  return <main className="onboarding-journey">
    <header className="onboarding-header"><Brand/><Link className="text-link" to="/logout">Sign out</Link></header>
    <section className="onboarding-card" aria-labelledby="onboarding-title">
      <div className="onboarding-intro">
        <h1 id="onboarding-title">Create your profile</h1>
        <img src="/pebble/pebble.png" alt="" width="84" height="63"/>
      </div>
      <form className="account-form" onSubmit={event => void submit(event)}>
        <fieldset disabled={busy}>
          <label><span id="onboarding-display-label">Display name</span> <small id="onboarding-display-note">The name people see.</small>
            <input aria-labelledby="onboarding-display-label" aria-describedby="onboarding-display-note" autoComplete="nickname" required maxLength={120} value={displayName} onChange={event => setDisplayName(event.target.value)}/>
          </label>
          <label><span id="onboarding-username-label">Username</span> <small id="onboarding-username-note">Your unique @handle.</small>
            <input aria-labelledby="onboarding-username-label" aria-describedby="onboarding-username-note" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={80} value={username} onChange={event => setUsername(event.target.value)}/>
          </label>
          <fieldset className="onboarding-birthday" aria-describedby="birthday-note">
            <legend>Birthday</legend>
            <p id="birthday-note">Private. Pebble uses it to confirm you’re 18 or older.</p>
            <div className="onboarding-date">
              <label>Month<input inputMode="numeric" autoComplete="bday-month" placeholder="MM" pattern="[0-9]{1,2}" required maxLength={2} value={month} onChange={event => setMonth(event.target.value)}/></label>
              <label>Day<input inputMode="numeric" autoComplete="bday-day" placeholder="DD" pattern="[0-9]{1,2}" required maxLength={2} value={day} onChange={event => setDay(event.target.value)}/></label>
              <label>Year<input inputMode="numeric" autoComplete="bday-year" placeholder="YYYY" pattern="[0-9]{4}" required maxLength={4} value={year} onChange={event => setYear(event.target.value)}/></label>
            </div>
          </fieldset>
        </fieldset>
        <ErrorMessage>{action.error || current.error}</ErrorMessage>
        {current.error && !current.available && <ActionButton secondary disabled={busy} onClick={current.reload}>Reload saved profile</ActionButton>}
        <button className="btn" disabled={busy || !current.available}>{busy ? 'Saving…' : 'Enter Pebble'}</button>
      </form>
    </section>
  </main>
}
