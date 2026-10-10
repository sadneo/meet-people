import { useState, type FormEvent, type ReactNode } from 'react'
import { usePrototype } from './context'
import { USERNAME_CHANGE_DAYS, nextUsernameChange, people } from './model'
import { Button, Icon, Modal } from './ui'
import { EmailChangeSchema, PasswordChangeSchema, UsernameSchema } from '../../../shared/profile'

// Everything here is local demo state; nothing is sent to the profile API yet.
type Dialog = 'account' | 'safety' | 'username' | 'email' | 'password' | 'two-factor' | 'sessions' | 'export' | 'delete'
const SENSITIVE: Dialog[] = ['email', 'password', 'sessions', 'export', 'delete']
const LANGUAGES = [['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['es-ES', 'Español'], ['fr-FR', 'Français'], ['de-DE', 'Deutsch'], ['zh-CN', '中文（简体）'], ['ko-KR', '한국어'], ['ja-JP', '日本語']] as const
const DEMO_SECRET = 'JBSW Y3DP EHPK 3PXP'
const deviceTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone
const deviceLocale = () => navigator.language || 'en-US'
const formatDay = (date: Date) => date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

export function Settings() {
  const { state, dispatch, go } = usePrototype()
  const [open, setOpen] = useState<Dialog | null>(null)
  // A verified two-factor code unlocks sensitive actions for this visit, like an aal2 session.
  const [verified, setVerified] = useState(false)
  const close = () => setOpen(null)
  const heading = (icon: string, title: string, description?: string) => <header className="pt-settings-heading"><Icon name={icon} size={24} /><div><h2>{title}</h2>{description && <p>{description}</p>}</div></header>
  const toggle = (key: string, title: string, description: string) => <label className="pt-toggle-row"><span><strong>{title}</strong><small>{description}</small></span><input type="checkbox" role="switch" aria-label={title} checked={state.settings[key]} onChange={e => dispatch({ type: 'setting', key, value: e.target.checked })} /></label>
  const row = (dialog: Dialog, title: string, description: ReactNode) => <button className="pt-settings-row" onClick={() => setOpen(dialog)}><span><strong>{title}</strong><small>{description}</small></span><Icon name="chevron" size={16} /></button>
  const timezones = Intl.supportedValuesOf('timeZone')
  const locale = state.region.locale || deviceLocale()
  const timezone = state.region.timezone || deviceTimezone()
  const preview = new Date('2026-09-26T19:00:00Z').toLocaleString(locale, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: timezone, timeZoneName: 'short' })
  const dialog = open && SENSITIVE.includes(open) && state.account.twoFactor && !verified
    ? <Modal title="Confirm it’s you" onClose={close}><TwoFactorCode label="Verify" onVerified={() => setVerified(true)} /></Modal>
    : open && dialogFor(open)

  function dialogFor(name: Dialog) {
    switch (name) {
      case 'account': return <Modal title="Demo account" onClose={close}><p><strong>{state.profile.name}</strong> · @{state.account.username}</p><p>{state.account.email}</p>{state.account.pendingEmail && <p className="pt-hint">Waiting to confirm {state.account.pendingEmail}.</p>}<p className="pt-hint">Placeholder account details. Authentication and account management are not connected.</p><Button onClick={() => { close(); go('Profile') }}>Go to profile</Button></Modal>
      case 'safety': return <Modal title="Blocked users" onClose={close}>{state.blocked.length ? state.blocked.map(id => <div className="pt-toggle-row" key={id}><strong>{people.find(p => p.id === id)?.name}</strong><Button secondary onClick={() => dispatch({ type: 'unblock', id })}>Unblock</Button></div>) : <p>No blocked users in this session.</p>}<p className="pt-hint">Block or report someone from their profile. These controls are mock UI for review.</p></Modal>
      case 'username': return <Modal title="Change username" onClose={close}><UsernameForm onDone={close} /></Modal>
      case 'email': return <Modal title="Email address" onClose={close}><EmailForm /></Modal>
      case 'password': return <Modal title={state.account.hasPassword ? 'Change password' : 'Add a password'} onClose={close}><PasswordForm onDone={close} /></Modal>
      case 'two-factor': return <Modal title="Two-factor authentication" onClose={close}><TwoFactorSetup verified={verified} onVerified={() => setVerified(true)} /></Modal>
      case 'sessions': return <Modal title="Where you’re signed in" onClose={close}><Sessions /></Modal>
      case 'export': return <Modal title="Download your data" onClose={close}><DataExport /></Modal>
      case 'delete': return <Modal title="Delete your account?" onClose={close}><DeleteAccount onDeleted={() => { close(); setVerified(false); go('Login') }} /></Modal>
    }
  }

  return <>
    <div className="pt-settings-landscape" aria-hidden="true" />
    <div className="pt-settings">
      <header className="pt-settings-title"><span><Icon name="gear" size={28} /></span><div><h1 tabIndex={-1}>Settings</h1><p>Manage your account and preferences.</p></div></header>
      <section>{heading('profile', 'Account', 'Manage your account and profile information.')}
        {row('account', 'Account details', 'View and update your profile information.')}
        {row('username', 'Username', `@${state.account.username}`)}
        {row('email', 'Email address', state.account.pendingEmail ? `${state.account.email} · confirming ${state.account.pendingEmail}` : state.account.email)}
        {row('password', 'Password', state.account.hasPassword ? 'Password set. You can also sign in with an email link.' : 'You sign in with an email link. Add a password for another way in.')}
      </section>
      <section>{heading('key', 'Security', 'Keep your account safe.')}
        {row('two-factor', 'Two-factor authentication', state.account.twoFactor ? 'On · authenticator app' : 'Off · add a code from an authenticator app when you sign in.')}
        {row('sessions', 'Where you’re signed in', `${state.sessions.length} ${state.sessions.length === 1 ? 'device' : 'devices'}`)}
      </section>
      <section>{heading('bell', 'Notifications', 'Choose what notifications you receive.')}{toggle('notifications', 'Plan & message notifications', 'Get notified about new messages and activity in your conversations.')}</section>
      <section>{heading('shield', 'Privacy', 'Control who can find and see you on Pebble.')}{toggle('discoverable', 'Show me in discovery', 'Let other people find your profile.')}{toggle('availability', 'Share my availability', 'Show your free-time windows to connections.')}</section>
      <section>{heading('pin', 'Discovery & Availability', 'Settings that help people find you in the right place.')}{toggle('location', 'Nearby suggestions', 'Show people and events near your current location.')}{toggle('downtime', 'Downtime matching', 'Let Pebble look for a comfortable group while you’re away.')}{toggle('dating', 'Open to dating', 'Join the dating queue and see dating matches. Off unless you turn it on.')}</section>
      <section>{heading('map', 'Location', 'Manage your location settings.')}<div className="pt-settings-row"><span><strong>Campus location (demo)</strong><small>Campus is the fixed demo location for this prototype. Location access is not required.</small></span></div></section>
      <section>{heading('globe', 'Language & Region', 'How dates and times appear.')}
        <label className="pt-settings-row pt-settings-select"><span><strong>Language</strong><small>Pebble is in English for now; this sets date and time formats.</small></span><select aria-label="Language" value={state.region.locale} onChange={e => dispatch({ type: 'region', patch: { locale: e.target.value } })}><option value="">Device default</option>{LANGUAGES.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
        <label className="pt-settings-row pt-settings-select"><span><strong>Time zone</strong><small>Used for availability and plan times.</small></span><select aria-label="Time zone" value={state.region.timezone} onChange={e => dispatch({ type: 'region', patch: { timezone: e.target.value } })}><option value="">Device default · {deviceTimezone().split('/').at(-1)!.replaceAll('_', ' ')}</option>{timezones.map(zone => <option key={zone} value={zone}>{zone.replaceAll('_', ' ')}</option>)}</select></label>
        <div className="pt-settings-row"><span><strong>Preview</strong><small aria-live="polite">{preview}</small></span></div>
      </section>
      <section>{heading('matchmaking', 'Safety', 'Manage your interactions and blocked users.')}<button className="pt-settings-row" onClick={() => setOpen('safety')}><span><strong>Blocked users</strong><small>Block or report someone from their profile. These controls are mock UI for review.</small></span><Icon name="chevron" size={16} /></button>{state.blocked.map(id => <div className="pt-toggle-row" key={id}><strong>{people.find(p => p.id === id)?.name}</strong><Button secondary onClick={() => dispatch({ type: 'unblock', id })}>Unblock</Button></div>)}</section>
      <section>{heading('download', 'Your Data', 'Get a copy of what Pebble stores about you.')}{row('export', 'Download my data', 'Profile, settings, connections, messages, and activity as a JSON file.')}</section>
      <section className="pt-settings-actions">{heading('logout', 'Account Actions')}
        <div className="pt-settings-row"><span><strong>Log out of demo</strong><small>No active account. Community purchases stay on this device.</small></span><Button secondary onClick={() => go('Login')}>Log out of demo</Button></div>
        <div className="pt-settings-row"><span><strong>Delete account</strong><small>Permanently remove your profile, connections, messages, and photos.</small></span><Button secondary className="pt-danger" onClick={() => setOpen('delete')}>Delete account</Button></div>
      </section>
    </div>
    {dialog}
  </>
}

function TwoFactorCode({ label, onVerified }: { label: string; onVerified: () => void }) {
  const [code, setCode] = useState('')
  const valid = /^\d{6}$/.test(code)
  return <form onSubmit={e => { e.preventDefault(); if (valid) onVerified() }}><p>Enter the 6-digit code from your authenticator app.</p><label>6-digit code<input value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={6} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} /></label><p className="pt-hint">Prototype only. Any 6-digit code works.</p><Button type="submit" className="pt-wide" disabled={!valid}>{label}</Button></form>
}

function UsernameForm({ onDone }: { onDone: () => void }) {
  const { state, dispatch } = usePrototype()
  const [value, setValue] = useState(state.account.username)
  const [error, setError] = useState('')
  const locked = nextUsernameChange(state.account)
  if (locked) return <><p>You changed your username recently. You can change it again on {formatDay(locked)}.</p><Button className="pt-wide" onClick={onDone}>Done</Button></>
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const parsed = UsernameSchema.safeParse(value)
    if (!parsed.success) { setError(parsed.error.issues[0].message); return }
    if (people.some(person => person.id === parsed.data)) { setError('That username is taken.'); return }
    dispatch({ type: 'username', username: parsed.data })
    onDone()
  }
  return <form onSubmit={submit}><label>Username<input value={value} maxLength={30} autoCapitalize="none" spellCheck={false} aria-invalid={Boolean(error)} onChange={e => { setValue(e.target.value); setError('') }} /></label>{error && <p className="pt-form-error" role="alert">{error}</p>}<p className="pt-hint">3–30 lowercase letters, numbers, or underscores. You can change it once every {USERNAME_CHANGE_DAYS} days.</p><Button type="submit" className="pt-wide" disabled={!value.trim()}>Save username</Button></form>
}

function EmailForm() {
  const { state, dispatch } = usePrototype()
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const { email, pendingEmail } = state.account
  if (pendingEmail) return <div role="status"><p>We sent confirmation links to <strong>{email}</strong> and <strong>{pendingEmail}</strong>. Your email changes once both are confirmed.</p><p className="pt-hint">Prototype only. No email was sent.</p><Button className="pt-wide" onClick={() => dispatch({ type: 'account', patch: { email: pendingEmail, pendingEmail: null } })}>Confirm in demo</Button><Button secondary className="pt-wide" onClick={() => dispatch({ type: 'account', patch: { pendingEmail: null } })}>Cancel change</Button></div>
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const parsed = EmailChangeSchema.safeParse({ email: value })
    if (!parsed.success) { setError('Enter a valid email address.'); return }
    if (parsed.data.email === email) { setError('That is already your email.'); return }
    dispatch({ type: 'account', patch: { pendingEmail: parsed.data.email } })
  }
  return <form onSubmit={submit}><p>Current email: <strong>{email}</strong></p><label>New email<input type="email" value={value} autoComplete="email" aria-invalid={Boolean(error)} onChange={e => { setValue(e.target.value); setError('') }} /></label>{error && <p className="pt-form-error" role="alert">{error}</p>}<p className="pt-hint">We’ll send a confirmation link to both addresses.</p><Button type="submit" className="pt-wide" disabled={!value.trim()}>Send confirmation links</Button></form>
}

function PasswordForm({ onDone }: { onDone: () => void }) {
  const { state, dispatch } = usePrototype()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saved, setSaved] = useState(false)
  const valid = PasswordChangeSchema.safeParse({ password }).success
  const matches = password === confirm
  if (saved) return <div role="status"><p>Your password is saved. You can sign in with it or with an email link.</p><p className="pt-hint">Prototype only. No password was stored.</p><Button className="pt-wide" onClick={onDone}>Done</Button></div>
  return <form onSubmit={e => { e.preventDefault(); if (valid && matches) { dispatch({ type: 'account', patch: { hasPassword: true } }); setSaved(true) } }}>
    {!state.account.hasPassword && <p>You sign in with an email link. A password gives you another way in.</p>}
    <label>New password<input type="password" value={password} autoComplete="new-password" maxLength={72} onChange={e => setPassword(e.target.value)} /></label>
    <label>Confirm password<input type="password" value={confirm} autoComplete="new-password" maxLength={72} aria-invalid={Boolean(confirm) && !matches} onChange={e => setConfirm(e.target.value)} /></label>
    {confirm && !matches && <p className="pt-form-error" role="alert">Passwords don’t match.</p>}
    <p className="pt-hint">At least 8 characters.</p>
    <Button type="submit" className="pt-wide" disabled={!valid || !matches}>Save password</Button>
  </form>
}

function TwoFactorSetup({ verified, onVerified }: { verified: boolean; onVerified: () => void }) {
  const { state, dispatch } = usePrototype()
  const [step, setStep] = useState<'intro' | 'scan' | 'off'>('intro')
  if (state.account.twoFactor) {
    if (step === 'off') return verified
      ? <><p>Turning this off means only your email link or password is needed to sign in.</p><Button className="pt-wide pt-danger" onClick={() => { dispatch({ type: 'account', patch: { twoFactor: false } }); setStep('intro') }}>Turn off two-factor</Button></>
      : <TwoFactorCode label="Verify" onVerified={onVerified} />
    return <div role="status"><p><strong>Two-factor authentication is on.</strong> You’ll enter a code from your authenticator app when you sign in and before sensitive changes.</p><Button secondary className="pt-wide" onClick={() => setStep('off')}>Turn off two-factor</Button></div>
  }
  if (step === 'scan') return <><p>Scan this code with an authenticator app, or enter the key by hand.</p><DemoQr /><p className="pt-setup-key"><span>Setup key</span><code>{DEMO_SECRET}</code></p><TwoFactorCode label="Turn on two-factor" onVerified={() => { dispatch({ type: 'account', patch: { twoFactor: true } }); onVerified() }} /></>
  return <><p>Add a second step when you sign in: a 6-digit code from an authenticator app such as Google Authenticator, 1Password, or Authy.</p><p className="pt-hint">You’ll also be asked for a code before changing your email or password, signing out other devices, downloading your data, or deleting your account.</p><Button className="pt-wide" onClick={() => setStep('scan')}>Set up authenticator app</Button></>
}

// A decorative stand-in; the real QR code comes from Supabase's enrolment response.
function DemoQr() {
  const cells = Array.from({ length: 21 * 21 }, (_, i) => {
    const x = i % 21, y = Math.floor(i / 21)
    const finder = [[0, 0], [14, 0], [0, 14]].some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7)
    if (finder) {
      const [fx, fy] = [x < 7 ? 0 : 14, y < 7 ? 0 : 14]
      const dx = x - fx, dy = y - fy
      return dx === 0 || dy === 0 || dx === 6 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4)
    }
    return (x * 7 + y * 13 + x * y) % 5 < 2
  })
  return <svg className="pt-demo-qr" viewBox="-2 -2 25 25" role="img" aria-label="Sample QR code (demo)"><rect x="-2" y="-2" width="25" height="25" fill="#fffef9" />{cells.map((on, i) => on && <rect key={i} x={i % 21} y={Math.floor(i / 21)} width="1" height="1" />)}</svg>
}

function Sessions() {
  const { state, dispatch } = usePrototype()
  const others = state.sessions.filter(session => !session.current)
  return <>
    <ul className="pt-session-list">{state.sessions.map(session => <li key={session.id}><Icon name={session.device.startsWith('iPhone') ? 'mobile' : 'laptop'} /><span><strong>{session.device}</strong><small>{session.detail} · {session.lastActive}</small></span>{session.current ? <span className="pt-session-current">This device</span> : <Button secondary onClick={() => dispatch({ type: 'end-session', id: session.id })}>Sign out{' '}<span className="pt-sr-only">{session.device}</span></Button>}</li>)}</ul>
    <p className="pt-hint">Signing out takes effect right away on that device. Sample devices for this prototype.</p>
    <Button className="pt-wide" disabled={!others.length} onClick={() => dispatch({ type: 'end-other-sessions' })}>{others.length ? 'Sign out of all other devices' : 'No other devices'}</Button>
  </>
}

function DataExport() {
  const { state } = usePrototype()
  const [started, setStarted] = useState(false)
  const download = () => {
    const { account, profile, settings, region, blocked, plan, messages } = state
    const file = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), note: 'Prototype sample data only.', account, profile, settings, region, blocked, plan, messages }, null, 2)], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(file)
    link.download = `pebble-data-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(link.href)
    setStarted(true)
  }
  return <>
    <p>You’ll get a JSON file with your profile, settings, interests, availability, connections, messages, blocked users, reports you’ve filed, and event activity. Other people appear only by username.</p>
    {started && <p role="status"><strong>Your download has started.</strong> In the full app, the link stays available for 7 days and you can request one download a day.</p>}
    <p className="pt-hint">Prototype only. This file contains this demo’s sample data.</p>
    <Button className="pt-wide" onClick={download}><Icon name="download" size={18} />Download my data</Button>
  </>
}

function DeleteAccount({ onDeleted }: { onDeleted: () => void }) {
  const { dispatch } = usePrototype()
  const [confirm, setConfirm] = useState('')
  return <form onSubmit={e => { e.preventDefault(); if (confirm === 'DELETE') { dispatch({ type: 'delete-account' }); onDeleted() } }}>
    <p>This permanently deletes your profile, photos, interests, connections, messages, and plans. It can’t be undone.</p>
    <p className="pt-hint">Want a copy first? Use “Download my data” before deleting.</p>
    <label>Type DELETE to confirm<input value={confirm} autoComplete="off" autoCapitalize="characters" onChange={e => setConfirm(e.target.value)} /></label>
    <p className="pt-hint">Prototype only. This resets the demo; no real account is affected.</p>
    <Button type="submit" className="pt-wide pt-danger" disabled={confirm !== 'DELETE'}>Delete account</Button>
  </form>
}
