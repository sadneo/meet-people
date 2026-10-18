import { useState } from 'react'
import { completedAccountChapters, type Account } from '../../shared/account'
import { AccountProfileSchema } from '../../shared/account-profile'
import { ProfileIdentityForm } from '../features/account/ProfileIdentityForm'
import { MatchingSetup } from '../features/matchmaking/MatchingScreen'
import { ProfileInterests } from '../features/prototype/ProfileInterests'
import { Chips } from '../features/prototype/ui'
import { intents } from '../features/prototype/model'

const chapters = ['Basic profile', 'Interests', 'Social intent', 'Availability & preferences']
export function RegistrationOnboarding({ account, token, busy, enabled, save }: { account: Account; token: string; busy: boolean; enabled: boolean; save: (next: Account) => Promise<boolean> }) {
  const chapter = completedAccountChapters(account).length
  return <>{account.profile && <p>{account.profile.display_name}</p>}<ol aria-label="Onboarding progress">{chapters.map((title, index) => <li key={title} aria-current={index === chapter ? 'step' : undefined}>{index < chapter ? 'Saved: ' : ''}{title}</li>)}</ol><Chapter key={chapter} {...{ account, token, busy, enabled, save, chapter }} /></>
}
function Chapter({ account, token, busy, enabled, save, chapter }: { account: Account; token: string; busy: boolean; enabled: boolean; save: (next: Account) => Promise<boolean>; chapter: number }) {
  const [interests, setInterests] = useState(account.profile?.interests ?? [])
  const [preferences, setPreferences] = useState(account.preferences)
  const [error, setError] = useState('')
  const completed = Array.from({ length: chapter + 1 }, (_, i) => i)
  if (chapter === 0) return <ProfileIdentityForm account={null} enabled={enabled} busy={busy} onSaved={() => {}} submitLabel="Save identity and continue" save={identity => save({ ...account, completed: [0], profile: { birthdate: null, location_city: null, interests: [], availability: [], ...AccountProfileSchema.parse(identity) } })} />
  if (!account.profile) return null
  if (chapter === 1) return <form onSubmit={event => { event.preventDefault(); if (new Set(interests).size < 3) { setError('Choose at least three unique interests.'); return } void save({ ...account, completed, profile: { ...account.profile!, interests } }) }}><h2>Interests</h2><ProfileInterests values={interests} onChange={setInterests} disabled={!enabled || busy} />{error && <p role="alert">{error}</p>}<button className="pt-button pt-secondary" disabled={!enabled || busy}>Save interests and continue</button></form>
  if (chapter === 2) return <form onSubmit={event => { event.preventDefault(); if (!preferences.intents.length) { setError('Choose at least one social intent.'); return } void save({ ...account, preferences, completed }) }}><h2>Social intent</h2><Chips label="Social intent" options={intents} values={preferences.intents} multi onChange={values => setPreferences(value => ({ ...value, intents: values }))} />{error && <p role="alert">{error}</p>}<button className="pt-button pt-secondary" disabled={!enabled || busy}>Save social intent and continue</button></form>
  return <><h2>Availability &amp; preferences</h2><fieldset disabled={!enabled || busy}><label>Comfortable distance<select value={preferences.distance} onChange={event => setPreferences(value => ({ ...value, distance: event.target.value as Account['preferences']['distance'] }))}><option value="">Choose distance</option>{['Nearby', '5 miles', '10 miles'].map(value => <option key={value}>{value}</option>)}</select></label><label>Group preference<select value={preferences.group} onChange={event => setPreferences(value => ({ ...value, group: event.target.value as Account['preferences']['group'] }))}><option value="">Choose group preference</option>{['One-on-one', 'Small groups', 'Either'].map(value => <option key={value}>{value}</option>)}</select></label></fieldset><MatchingSetup token={token} canonicalIdentity={account.profile} initial={account.profile} busy={busy} error={error} writesAvailable={enabled} minimumRequired presentation="profile" submitLabel="Finish onboarding" save={profile => {
    if (!preferences.distance || !preferences.group) { setError('Choose distance and group preferences.'); return Promise.resolve(false) }
    return save({ ...account, preferences, profile, completed })
  }} /></>
}
