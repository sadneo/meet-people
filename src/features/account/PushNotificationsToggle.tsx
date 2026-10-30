import { useState } from 'react'
import { useSession } from '../../auth/useSession'
import { disablePush, enablePush, isPushEnabled, pushAvailable } from '../../platform/push'

// A switch for "Notifications on this phone". Only shown inside the Android app.
export function PushNotificationsToggle() {
  const { session } = useSession()
  const userId = session?.user.id
  const [on, setOn] = useState(() => (userId ? isPushEnabled(userId) : false))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  if (!pushAvailable() || !userId) return null

  async function change(next: boolean) {
    if (!userId) return
    setBusy(true); setMessage('')
    try {
      if (next) {
        const result = await enablePush(userId)
        setOn(result === 'enabled')
        if (result === 'denied') setMessage('Notifications are blocked. Allow them for Pebble in your phone’s Settings, then try again.')
        else if (result === 'failed') setMessage('Could not turn on notifications. Check your connection and try again.')
      } else {
        await disablePush(userId).catch(() => undefined)
        setOn(false)
      }
    } finally {
      setBusy(false)
    }
  }

  return <>
    <label className="pt-toggle-row"><span><strong>Notifications on this phone</strong><small>Get an alert for new messages, connection requests and matches. Alerts never include names or message text.</small></span>
      <input type="checkbox" role="switch" aria-label="Notifications on this phone" checked={on} disabled={busy} onChange={event => void change(event.target.checked)} />
    </label>
    {message && <p role="alert">{message}</p>}
  </>
}
