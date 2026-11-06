import { useEffect, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router'
import { PushNotifications } from '@capacitor/push-notifications'
import { useSession } from '../auth/useSession'
import { isNative } from './native'
import { cancelPushOperations, isPushEnabled, refreshPushToken, routeForPush, subscribePushPreference } from './push'

// Renders nothing. Mount once inside the router next to NativeBridge.
// While signed in with push enabled: keeps this phone's token fresh and opens the right screen when a notification is tapped.
export default function PushBridge() {
  const navigate = useNavigate()
  const { session } = useSession()
  const userId = session?.user.id
  const enabled = useSyncExternalStore(subscribePushPreference, () => !!userId && isPushEnabled(userId))

  useEffect(() => {
    return () => { if (userId) cancelPushOperations(userId) }
  }, [userId])

  useEffect(() => {
    if (!isNative() || !userId) return
    const controller = new AbortController()
    let live = true
    let handle: { remove(): Promise<void> } | undefined
    const remove = (listener: { remove(): Promise<void> }) => { void Promise.resolve().then(() => listener.remove()).catch(() => undefined) }
    if (enabled) {
      void refreshPushToken(userId, controller.signal).catch(() => undefined)
      void Promise.resolve().then(() => PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
        const path = routeForPush(notification.data?.kind)
        if (live && isPushEnabled(userId) && path) navigate(path)
      })).then(listener => {
        if (live) handle = listener
        else remove(listener)
      }).catch(() => undefined)
    }
    return () => {
      live = false
      controller.abort()
      if (handle) remove(handle)
    }
  }, [userId, enabled, navigate])

  return null
}
