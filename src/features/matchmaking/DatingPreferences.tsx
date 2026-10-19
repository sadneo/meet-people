import { useState } from 'react'
import { useAccount } from '../../auth/account-context'
import { useDatingPreferences } from './useDatingPreferences'
import { datingAggregateDraft } from './dating-aggregate-draft'
import { MatchFilterSheet, filterDefaults } from './MatchFilterSheet'

export function DatingPreferences({ open, close, live = false, onSaved }: { open: boolean; close: () => void; live?: boolean; onSaved?: () => void }) {
  const account = useAccount(), owner = account?.loaded ? account.session?.user.id ?? null : null
  return <DatingResource key={owner ?? 'signed-out'} owner={owner} token={owner ? account?.session?.access_token ?? null : null} busy={account?.busy ?? false} home={account?.account.profile?.location_city ?? null} open={open} close={close} live={live} onSaved={onSaved} />
}
function DatingResource({ owner, token, busy, home, open, close, live, onSaved }: { owner: string | null; token: string | null; busy: boolean; home: string | null; open: boolean; close: () => void; live: boolean; onSaved?: () => void }) {
  // Remains mounted while the sheet is closed: cancellation never discards an
  // uncertain mutation/reconciliation gate or substitutes an editable preview.
  const resource = useDatingPreferences(owner, token, busy), [saved, setSaved] = useState(false)
  const draft = resource.snapshot ? datingAggregateDraft(resource.snapshot) : null
  const canonical = { ...resource, save: async (value: Parameters<typeof resource.save>[0]) => {
    setSaved(false)
    const confirmed = await resource.save(value)
    if (confirmed) { setSaved(true); onSaved?.() }
    return confirmed
  } }
  return <>
    {saved && <p className="dating-disclosure" role="status">{live ? 'Dating preferences saved and reloaded. Start discovery separately when ready.' : 'Disabled Dating draft saved and reloaded. Recommendations remain fictional.'}</p>}
    {open && <MatchFilterSheet key={draft ? 'confirmed' : 'unknown'} mode="Dating" value={draft?.filters ?? filterDefaults.Dating} datingValue={draft?.profile} searchValue={draft?.options} home={home} close={close} canonicalDating={canonical} liveDating={live} />}
  </>
}
