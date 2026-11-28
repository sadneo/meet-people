import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { hasBasicProfile, SaveAccountSchema } from '../../shared/account'
import { checkUsernameWrite } from '../../shared/username'
import { safeReturnTo } from '../auth/returnTo'
import { ActionButton, Brand, ErrorMessage } from './common'
import { useCurrent } from './current'
import { useAction } from './hooks'
import { meetsMinimumAge } from './age-visibility'
import { deviceTimeZone } from '../features/account/timezones'
import { haptic, toast, useShakeOnError } from './feedback'
import { BusyLabel } from './FeedbackUi'
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
  const destination = safeReturnTo(search.get('returnTo')) ?? '/matchmaking'
  const busy = current.busy || current.loading || action.busy
  const form = useRef<HTMLFormElement>(null)
  const dayInput = useRef<HTMLInputElement>(null)
  const yearInput = useRef<HTMLInputElement>(null)
  const monthInput = useRef<HTMLInputElement>(null)
  useShakeOnError(form, action.error)
  // Digits only; move on once a part can't take another digit.
  const datePart = (value: string, max: number, next: { current: HTMLInputElement | null } | null, firstDigitLimit: number) => {
    const digits = value.replace(/\D/g, '').slice(0, max)
    if (next && (digits.length === max || (digits.length === 1 && Number(digits) > firstDigitLimit))) next.current?.focus()
    return digits
  }
  const backTo = (event: KeyboardEvent<HTMLInputElement>, previous: { current: HTMLInputElement | null }) => {
    if (event.key === 'Backspace' && !event.currentTarget.value) previous.current?.focus()
  }

  if (hasBasicProfile(saved)) return <Navigate replace to={destination}/>

  async function submit(event: FormEvent) {
    event.preventDefault()
    await action.run(async () => {
      const checked = checkUsernameWrite(username, saved?.username)
      if ('error' in checked) throw new Error(checked.error)
      const birthdate = [year, month.padStart(2, '0'), day.padStart(2, '0')].join('-')
      const next = SaveAccountSchema.safeParse({
        ...account,
        initialTimeZone: deviceTimeZone(),
        profile: {
          bio: null, location_city: null, avatar_url: null, interests: [], availability: [],
          ...saved, display_name: displayName, username: checked.username, birthdate,
        },
        completed: account.completed.length ? account.completed : [0],
      })
      if (!next.success) {
        const issue = next.error.issues[0]
        throw new Error(issue?.path.includes('birthdate') ? 'Enter a valid birthday.' : issue?.message ?? 'Check your name and birthday.')
      }
      if (!meetsMinimumAge(birthdate)) throw new Error('You must be at least 18 to use Pebble.')
      if (await current.save(next.data)) { haptic('success'); toast('Welcome to Pebble') }
    })
  }

  return <main className="onboarding-journey">
    <header className="onboarding-header"><Brand/><Link className="text-link" to="/logout">Sign out</Link></header>
    <section className="onboarding-card" aria-labelledby="onboarding-title">
      <div className="onboarding-intro">
        <h1 id="onboarding-title">Create your profile</h1>
        <img src="/pebble/pebble.png" alt="" width="84" height="63"/>
      </div>
      <form ref={form} className="account-form" onSubmit={event => void submit(event)}>
        <fieldset disabled={busy}>
          <label><span id="onboarding-display-label">Display name</span> <small id="onboarding-display-note">The name people see.</small>
            <input aria-labelledby="onboarding-display-label" aria-describedby="onboarding-display-note" autoComplete="nickname" required maxLength={120} value={displayName} onChange={event => setDisplayName(event.target.value)}/>
          </label>
          <label><span id="onboarding-username-label">Username</span> <small id="onboarding-username-note">Your unique @handle: letters, numbers, . or _.</small>
            <input aria-labelledby="onboarding-username-label" aria-describedby="onboarding-username-note" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={30} value={username} onChange={event => setUsername(event.target.value)}/>
          </label>
          <fieldset className="onboarding-birthday" aria-describedby="birthday-note">
            <legend>Birthday</legend>
            <p id="birthday-note">Private. Pebble uses it to confirm you’re 18 or older.</p>
            <div className="onboarding-date">
              <label>Month<input ref={monthInput} inputMode="numeric" autoComplete="bday-month" placeholder="MM" pattern="[0-9]{1,2}" required maxLength={2} value={month} onChange={event => setMonth(datePart(event.target.value, 2, dayInput, 1))}/></label>
              <label>Day<input ref={dayInput} inputMode="numeric" autoComplete="bday-day" placeholder="DD" pattern="[0-9]{1,2}" required maxLength={2} value={day} onKeyDown={event => backTo(event, monthInput)} onChange={event => setDay(datePart(event.target.value, 2, yearInput, 3))}/></label>
              <label>Year<input ref={yearInput} inputMode="numeric" autoComplete="bday-year" placeholder="YYYY" pattern="[0-9]{4}" required maxLength={4} value={year} onKeyDown={event => backTo(event, dayInput)} onChange={event => setYear(datePart(event.target.value, 4, null, 9))}/></label>
            </div>
          </fieldset>
        </fieldset>
        <ErrorMessage>{action.error || current.error}</ErrorMessage>
        {current.error && !current.available && <ActionButton secondary disabled={busy} onClick={current.reload}>Reload saved profile</ActionButton>}
        <button className="btn" disabled={busy || !current.available}>{busy ? <BusyLabel busy>Saving…</BusyLabel> : 'Enter Pebble'}</button>
      </form>
    </section>
  </main>
}
