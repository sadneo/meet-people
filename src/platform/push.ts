import { PushNotifications } from '@capacitor/push-notifications'
import { z } from 'zod'
import { authorizedRequest } from '../auth/authorizedRequest'
import { isNative } from './native'

// Push is opt-in per person per device: nothing is requested or registered until the user
// switches it on in Settings, and the choice is remembered separately for each account.
const CHANNEL_ID = 'default' // must match the channel id the API sends (api/push-dispatcher.ts)
const TOKEN_KEY = 'pebble.push.token'
const enabledKey = (userId: string) => `pebble.push.enabled.${userId}`

function remember(key: string, value: string | null) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value) } catch { /* storage unavailable */ }
}
function recall(key: string) {
  try { return localStorage.getItem(key) } catch { return null }
}

export const pushAvailable = () => isNative()
export const isPushEnabled = (userId: string) => recall(enabledKey(userId)) === '1'
export const setPushEnabled = (userId: string, enabled: boolean) => remember(enabledKey(userId), enabled ? '1' : null)

// Where tapping a notification opens. Only the kind travels in the payload, never a path.
export function routeForPush(kind: unknown): string | null {
  if (kind === 'message' || kind === 'connection_request' || kind === 'connection_accepted') return '/messages'
  if (kind === 'dating_match') return '/matchmaking?view=dating'
  return null
}

async function sendToken(token: string) {
  await authorizedRequest('/api/push/devices', z.null(), { method: 'POST', body: { token, platform: 'android' } })
  remember(TOKEN_KEY, token)
}

// Asks the OS for a Firebase token. Resolves with it, or rejects if registration fails.
export async function fetchPushToken(): Promise<string> {
  const handles: { remove(): Promise<void> }[] = []
  try {
    return await new Promise<string>((resolve, reject) => {
      void PushNotifications.addListener('registration', ({ value }) => resolve(value)).then(handle => handles.push(handle))
      void PushNotifications.addListener('registrationError', ({ error }) => reject(new Error(error))).then(handle => handles.push(handle))
      void PushNotifications.register().catch(reject)
    })
  } finally {
    await Promise.all(handles.map(handle => handle.remove()))
  }
}

export type EnablePushResult = 'enabled' | 'denied' | 'unsupported' | 'failed'

export async function enablePush(userId: string): Promise<EnablePushResult> {
  if (!isNative()) return 'unsupported'
  try {
    let permission = await PushNotifications.checkPermissions()
    if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') permission = await PushNotifications.requestPermissions()
    if (permission.receive !== 'granted') return 'denied'
    await PushNotifications.createChannel({ id: CHANNEL_ID, name: 'Pebble', description: 'Messages and connection requests', importance: 4 })
    await sendToken(await fetchPushToken())
    setPushEnabled(userId, true)
    return 'enabled'
  } catch {
    return 'failed'
  }
}

// Removes this phone's token from the account. Best effort: used when switching push off and on logout,
// so the next person to sign in on this phone never receives the previous account's notifications.
export async function unregisterPushToken() {
  const token = recall(TOKEN_KEY)
  if (!token) return
  try {
    await authorizedRequest('/api/push/devices', z.null(), { method: 'DELETE', body: { token } })
  } finally {
    remember(TOKEN_KEY, null)
  }
}

export async function disablePush(userId: string) {
  setPushEnabled(userId, false)
  try { await unregisterPushToken() } finally {
    if (isNative()) await PushNotifications.unregister().catch(() => undefined)
  }
}

// Re-sends the token at app start (Firebase can rotate it) when push is already on and allowed.
export async function refreshPushToken() {
  const permission = await PushNotifications.checkPermissions()
  if (permission.receive !== 'granted') return
  await sendToken(await fetchPushToken())
}
