import { useEffect, useRef, useState } from 'react'
import { useAccount } from '../../auth/account-context'
import { sameDetailedSettings, type DetailedSettings, type DetailedSettingsValues } from '../../../shared/detailed-settings'
import { useDetailedSettings } from './useDetailedSettings'

type Props = { notificationsEnabled: boolean; discoveryEnabled: boolean }
export function SettingsDetails(props: Props) {
  const account = useAccount()
  const owner = account?.loaded ? account.session?.user.id ?? null : null
  return <DetailedSettingsResource key={owner ?? 'signed-out'} {...props} owner={owner} token={owner ? account?.session?.access_token ?? null : null} accountBusy={account?.busy ?? false} />
}
function DetailedSettingsResource({ owner, token, accountBusy, ...masters }: Props & { owner: string | null; token: string | null; accountBusy: boolean }) {
  const resource = useDetailedSettings(owner, token, accountBusy)
  // A changed persisted master warrants a read-only refresh, never a mutation or
  // implicit reconciliation. Defer while either resource is busy, then refresh.
  const fingerprint = `${masters.notificationsEnabled}:${masters.discoveryEnabled}`
  const observed = useRef(fingerprint)
  const invalidated = useRef(false)
  useEffect(() => {
    // Remember transitions, not just the final value: off -> on during a save
    // can return to the original fingerprint after its GET captured "off".
    if (observed.current !== fingerprint) { observed.current = fingerprint; invalidated.current = true }
    if (!invalidated.current || accountBusy || resource.busy || resource.loading || resource.reconcileRequired || !resource.snapshot) return
    invalidated.current = false
    void resource.refresh()
  }, [fingerprint, accountBusy, resource.busy, resource.loading, resource.reconcileRequired, resource.snapshot, resource.refresh])
  return <section className="account-preview-section" aria-label="Detailed notification and discovery preferences">
    <details className="account-settings-detail">
      <summary onClick={event => { if (resource.busy) event.preventDefault() }}>Notification &amp; discovery details</summary>
      <p>These saved preferences do not verify delivery or live discovery. Dating remains a local prototype.</p>
      <SettingsFeedback resource={resource} />
      {resource.snapshot ? <DetailedSettingsForm resource={resource} initial={resource.snapshot} accountBusy={accountBusy} {...masters} />
        : <button type="button" className="account-secondary" disabled={!token || resource.loading} onClick={() => void resource.reload()}>Reload saved preferences</button>}
    </details>
  </section>
}
function SettingsFeedback({ resource }: { resource: ReturnType<typeof useDetailedSettings> }) {
  return <>{resource.loading && <p role="status">Loading saved detailed preferences…</p>}{resource.busy && <p role="status">Saving and confirming detailed preferences…</p>}{resource.error && <p role="alert">{resource.error}</p>}{resource.snapshot && !resource.canWrite && !resource.busy && <p className="account-feature-note">Last confirmed values only. Reload before saving.</p>}</>
}
function DetailedSettingsForm({ resource, initial, accountBusy, notificationsEnabled, discoveryEnabled }: Props & { resource: ReturnType<typeof useDetailedSettings>; initial: DetailedSettings; accountBusy: boolean }) {
  const [baseline, setBaseline] = useState(initial), [draft, setDraft] = useState(() => ({ ...initial.settings }))
  const [notice, setNotice] = useState(''), [reloading, setReloading] = useState(false)
  const active = useRef(true), draftEpoch = useRef(0), reloadPending = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false; draftEpoch.current++ } }, [])
  const dirty = !sameDetailedSettings(draft, baseline.settings)
  const latest = resource.snapshot!
  const notifications = notificationsEnabled && latest.masters?.notifications === true
  const discovery = discoveryEnabled && latest.masters?.discoverable === true
  const busy = resource.busy || accountBusy
  const changed = baseline.revision !== latest.revision
  const toggle = (key: keyof DetailedSettingsValues, label: string, suppressed: boolean) => <label className="account-feature-check"><input type="checkbox" checked={draft[key]} disabled={busy || reloading || suppressed} onChange={event => { draftEpoch.current++; setDraft({ ...draft, [key]: event.target.checked }); setNotice('') }} />{label}</label>
  function adopt(snapshot: DetailedSettings) {
    setBaseline(snapshot); setDraft({ ...snapshot.settings })
  }
  return <form className="account-feature-form" onSubmit={event => {
    event.preventDefault()
    if (!dirty || busy || reloading || changed || !resource.canWrite) return
    const epoch = ++draftEpoch.current
    setNotice('')
    void resource.save({ expectedRevision: baseline.revision, settings: draft }).then(confirmed => {
      if (confirmed && active.current && epoch === draftEpoch.current) { adopt(confirmed); setNotice('Detailed preferences saved and reloaded.') }
    })
  }}>
    {latest.masters === null && <p>Persisted global controls are unavailable. Detailed choices are suppressed.</p>}
    <fieldset disabled={busy || reloading || !notifications}>
      <legend>Notification categories</legend>
      {!notifications && latest.masters !== null && <p>Notification preferences are suppressed by an off global master. Stored choices are retained.</p>}
      {toggle('messages', 'New messages', !notifications)}
      {toggle('plans', 'Plan invitations and changes', !notifications)}
      {toggle('matches', 'Match updates', !notifications)}
      <p className="account-feature-note">Device notification access: {typeof Notification === 'undefined' ? 'not supported in this browser' : Notification.permission === 'granted' ? 'allowed by this browser; delivery is not connected' : Notification.permission === 'denied' ? 'blocked in browser settings' : 'not requested'}. No push or email delivery is configured here.</p>
    </fieldset>
    <fieldset disabled={busy || reloading || !discovery}>
      <legend>Discovery by mode</legend>
      {!discovery && latest.masters !== null && <p>Discovery preferences are suppressed by an off global master. This is not proof of live privacy enforcement.</p>}
      {toggle('friendsDiscovery', 'Friends discovery preference', !discovery)}
      {toggle('datingDiscovery', 'Dating discovery preference', !discovery)}
      <p className="account-feature-note">Dating defaults off. Saving a preference or visible identity field never activates live Dating.</p>
    </fieldset>
    {dirty && <p role="status">Unsaved detailed preference changes</p>}
    {changed && <p role="status">Saved preferences changed. Reload saved preferences to replace this draft before saving.</p>}
    {notice && <p role="status">{notice}</p>}
    <p className="account-feature-note">Reload saved preferences replaces this draft with canonical values. It never retries a save.</p>
    <div className="account-feature-actions">
      <button type="button" className="account-secondary" disabled={busy || (!dirty && !reloading)} onClick={() => {
        draftEpoch.current++; reloadPending.current = false; setReloading(false); setNotice(''); adopt(latest)
      }}>Cancel detail changes</button>
      <button type="button" className="account-secondary" disabled={busy || resource.loading} onClick={() => {
        if (reloadPending.current) return
        reloadPending.current = true
        const epoch = ++draftEpoch.current
        setReloading(true); setNotice('')
        void resource.reload().then(snapshot => {
          if (!active.current || epoch !== draftEpoch.current) return
          reloadPending.current = false; setReloading(false)
          if (snapshot) { adopt(snapshot); setNotice('Saved preferences reloaded. Review them before editing.') }
        })
      }}>Reload saved preferences</button>
      <button type="submit" className="account-green-action" disabled={!dirty || busy || reloading || changed || !resource.canWrite}>Save detailed preferences</button>
    </div>
  </form>
}
export function LocationAccessDetails() {
  const [status, setStatus] = useState(() => typeof navigator.permissions?.query === 'function' ? 'Checking browser support…' : 'This browser cannot report location access here.'), [revision, setRevision] = useState(0)
  useEffect(() => {
    let live = true, permission: PermissionStatus | undefined
    if (!navigator.permissions?.query) return
    void navigator.permissions.query({ name: 'geolocation' }).then(value => {
      if (!live) return
      permission = value
      const update = () => setStatus(value.state === 'granted' ? 'Allowed by this browser. Location is not being read.' : value.state === 'denied' ? 'Blocked in browser settings. You can use your home or a temporary search area.' : 'Not requested. You can use your home or a temporary search area.')
      value.onchange = update; update()
    }).catch(() => { if (live) setStatus('Location access could not be checked. Your home and temporary areas remain available.') })
    return () => { live = false; if (permission) permission.onchange = null }
  }, [revision])
  return <details className="account-settings-detail"><summary>Device location &amp; search areas</summary><p role="status">{status}</p><p className="account-feature-note">Nearby suggestions, home city and search distance are separate choices. This preview never requests or reads your coordinates. Use the filters on Friends or Dating to preview a temporary area.</p><button type="button" className="account-secondary" onClick={() => setRevision(value => value + 1)}>Check location access</button><p className="account-feature-note">Shared weekly schedule timezone: America/New_York. Changing your home or search area does not convert saved times.</p></details>
}
