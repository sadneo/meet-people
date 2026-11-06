import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useSession } from '../../auth/useSession'
import { disablePush, enablePush, isPushEnabled, pushAvailable, subscribePushPreference } from '../../platform/push'

// A switch for "Notifications on this phone". Only shown inside the Android app.
export function PushNotificationsToggle() {
  const { session } = useSession()
  const userId = session?.user.id
  return userId && pushAvailable() ? <AccountPushToggle key={userId} userId={userId} /> : null
}

function AccountPushToggle({ userId }: { userId: string }) {
  const on = useSyncExternalStore(subscribePushPreference, () => isPushEnabled(userId))
  const pending = useRef<AbortController | null>(null)
  const [{ busy, message }, setFeedback] = useState({ busy: false, message: '' })
  useEffect(() => {
    return () => { pending.current?.abort(); pending.current = null }
  }, [userId])

  async function change(next: boolean) {
    if (pending.current) return
    const controller = new AbortController()
    pending.current = controller
    setFeedback({ busy: true, message: '' })
    let message = ''
    try {
      if (next) {
        const result = await enablePush(userId, controller.signal)
        if (result === 'denied') message = 'Notifications are blocked. Allow them for Pebble in your phone’s Settings, then try again.'
        else if (result === 'failed') message = 'Could not turn on notifications. Check your connection and try again.'
      } else {
        try { await disablePush(userId, controller.signal) } catch {
          message = 'Your preference is off, but stopping notifications could not be confirmed. Turn off Pebble notifications in your phone’s Settings.'
        }
      }
    } finally {
      if (pending.current === controller) {
        pending.current = null
        setFeedback({ busy: false, message })
      }
    }
  }

  return <>
    <label className="pt-toggle-row"><span><strong>Notifications on this phone</strong><small>Get an alert for new messages, connection requests and matches. Alerts never include names or message text.</small></span>
      <input type="checkbox" role="switch" aria-label="Notifications on this phone" checked={on} disabled={busy} onChange={event => void change(event.target.checked)} />
    </label>
    {message && <p role="alert">{message}</p>}
  </>
}
