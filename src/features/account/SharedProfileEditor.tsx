import { useState } from 'react'
import { MatchingSetup } from '../matchmaking/MatchingScreen'
import type { useSharedUserProfile } from './useSharedUserProfile'
import { ProfileIdentityForm } from './ProfileIdentityForm'

export function SharedProfileEditor({ data, token, close }: { data: ReturnType<typeof useSharedUserProfile>; token: string | null; close: () => void }) {
  const [initialized, setInitialized] = useState(!data.loading)
  if (!data.loading && !initialized) setInitialized(true)
  if (data.loading && !initialized) return <div><p role="status">Loading shared profile…</p><button type="button" className="pt-button pt-secondary" onClick={close}>Cancel</button></div>
  return <ReadySharedProfileEditor data={data} token={token} close={close} />
}

function ReadySharedProfileEditor({ data, token, close }: { data: ReturnType<typeof useSharedUserProfile>; token: string | null; close: () => void }) {
  const [created, setCreated] = useState(false)
  return <div className="pt-shared-profile-editor match-home match-live match-calm">
    {data.loading && <p role="status">Reloading shared profile… Your draft is kept.</p>}
    <ProfileIdentityForm account={data.account} enabled={data.canSaveIdentity} busy={data.busy} save={data.saveIdentity} onSaved={creating => { if (creating) setCreated(true); else close() }} />
    {created && <p role="status">Identity saved. Add your shared preferences below.</p>}
    {(data.profile || (data.account && data.profileKnown)) && token ? <MatchingSetup key={token} token={token} initial={data.profile} busy={data.busy} error="" save={async draft => { const saved = await data.saveShared(draft); if (saved) close(); return saved }} presentation="profile" minimumRequired navigation={false} writesAvailable={data.canWrite} /> : <section><h3>Shared preferences</h3><p>{data.available ? 'A saved server identity is required before saving shared preferences. Create your identity here first.' : 'Shared preferences are unavailable. Reload before editing.'}</p></section>}
    {data.error && <div><p role="alert">{data.error}</p>{!data.available && <p>Saving is blocked. Reload to check Profile service availability; your draft is kept. If it stays unavailable, contact the app operator.</p>}<button type="button" className="pt-button pt-secondary" disabled={data.loading || data.busy} onClick={data.reload}>Reload shared profile</button></div>}
    <div className="pt-profile-editor-actions"><button type="button" className="pt-button pt-secondary" disabled={data.busy} onClick={close}>Cancel</button></div>
  </div>
}
