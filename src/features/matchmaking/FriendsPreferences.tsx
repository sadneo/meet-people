import { friendsRuntime } from './friends-runtime-client'
import { useEffect, useState } from 'react'
import { useAccount } from '../../auth/account-context'
import { useFriendsPreferences } from './useFriendsPreferences'
import { friendsPreferenceDraft } from './friends-preferences-draft'
import { MatchFilterSheet, filterDefaults } from './MatchFilterSheet'

export function FriendsPreferences({ open, close, blocked = false, home }: { open: boolean; close: () => void; blocked?: boolean; home: string | null }) {
  const account = useAccount(), owner = account?.loaded ? account.session?.user.id ?? null : null
  return <FriendsResource key={owner ?? 'signed-out'} owner={owner} token={owner ? account?.session?.access_token ?? null : null} busy={blocked || (account?.busy ?? false)} home={home} open={open} close={close} />
}
function FriendsResource({ owner, token, busy, home, open, close }: { owner: string | null; token: string | null; busy: boolean; home: string | null; open: boolean; close: () => void }) {
  // Keep authority mounted across close/reopen; no preview fallback or implicit
  // reconciliation by dismissing a failed/uncertain save.
  const resource = useFriendsPreferences(owner, token, busy), [saved, setSaved] = useState(false)
  const [verifiedPolicy, setVerifiedPolicy] = useState<string | null>(null)
  const scope = `${owner}:${token}`
  useEffect(() => {
    if (!owner || !token) return
    const controller = new AbortController()
    void friendsRuntime(token, controller.signal).then(value => { if (!controller.signal.aborted && value.available) setVerifiedPolicy(scope) }).catch(() => {})
    return () => controller.abort()
  }, [owner, token, scope])
  const nearbyPolicyVerified = verifiedPolicy === scope

  // GET returns an opaque ref, not a resolution receipt. Latch observed home
  // changes even while closed; a reload alone cannot revalidate that old ref.
  const [homeBinding, setHomeBinding] = useState({ home, changed: false })
  if (homeBinding.home !== home) setHomeBinding({ home, changed: true })
  const draft = resource.snapshot ? friendsPreferenceDraft(resource.snapshot) : null
  const canonical = { ...resource, homeReferenceInvalidated: homeBinding.changed || homeBinding.home !== home, save: async (value: Parameters<typeof resource.save>[0]) => {
    setSaved(false)
    const confirmed = await resource.save(value)
    if (confirmed) {
      setHomeBinding(current => current.home === home ? { ...current, changed: false } : current)
      setSaved(true)
    }
    return confirmed
  } }
  return <>
    {saved && <p className="friends-search-disclosure" role="status">{nearbyPolicyVerified ? 'Friends filters saved and reloaded. The next active search check uses these preferences.' : 'Friends filters saved and reloaded. Saved filters are not applied to the current queue.'}</p>}
    {open && <MatchFilterSheet key={draft ? 'confirmed' : 'unknown'} mode="Friends" value={draft?.filters ?? filterDefaults.Friends} searchValue={draft?.options} home={home} close={close} canonicalFriends={canonical} nearbyPolicyVerified={nearbyPolicyVerified} />}
  </>
}
