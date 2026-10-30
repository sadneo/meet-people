import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { PushNotifications } from '@capacitor/push-notifications'
import { useSession } from '../auth/useSession'
import { isNative } from './native'
import { isPushEnabled, refreshPushToken, routeForPush } from './push'

// Renders nothing. Mount once inside the router next to NativeBridge.
// While signed in with push enabled: keeps this phone's token fresh and opens the right screen when a notification is tapped.
export default function PushBridge() {
  const navigate = useNavigate()
  const { session } = useSession()
  const userId = session?.user.id

  useEffect(() => {
    if (!isNative() || !userId || !isPushEnabled(userId)) return
    let live = true
    void refreshPushToken().catch(() => undefined)
    const listener = PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
      const path = routeForPush(notification.data?.kind)
      if (live && path) navigate(path)
    })
    return () => {
      live = false
      void listener.then(handle => handle.remove())
    }
  }, [userId, navigate])

  return null
}
