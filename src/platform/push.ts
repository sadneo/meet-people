import { PushNotifications } from '@capacitor/push-notifications'
import { z } from 'zod'
import { authorizedRequest } from '../auth/authorizedRequest'
import { isNative } from './native'

// Push is opt-in per person per device: nothing is requested or registered until the user
// switches it on in Settings, and the choice is remembered separately for each account.
const CHANNEL_ID = 'default' // must match the channel id the API sends (api/push-dispatcher.ts)
const TOKEN_KEY = 'pebble.push.token'
const enabledKey = (userId: string) => `pebble.push.enabled.${userId}`
const REGISTRATION_TIMEOUT_MS = 10000
const CLEANUP_TIMEOUT_MS = 3000
const preferenceListeners = new Set<() => void>()
type PushOperation = { userId: string; controller: AbortController }
let activeOperation: PushOperation | undefined

function remember(key: string, value: string | null) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value) } catch { /* storage unavailable */ }
}
function recall(key: string) {
  try { return localStorage.getItem(key) } catch { return null }
}

export const pushAvailable = () => isNative()
export const isPushEnabled = (userId: string) => recall(enabledKey(userId)) === '1'
export function subscribePushPreference(listener: () => void) {
  preferenceListeners.add(listener)
  return () => { preferenceListeners.delete(listener) }
}
export function cancelPushOperations(userId?: string) {
  if (activeOperation && (!userId || activeOperation.userId === userId)) {
    activeOperation.controller.abort()
    activeOperation = undefined
  }
}
export function setPushEnabled(userId: string, enabled: boolean) {
  if (!enabled) cancelPushOperations(userId)
  remember(enabledKey(userId), enabled ? '1' : null)
  preferenceListeners.forEach(listener => listener())
}

// Where tapping a notification opens. Only the kind travels in the payload, never a path.
export function routeForPush(kind: unknown): string | null {
  if (kind === 'message' || kind === 'connection_request' || kind === 'connection_accepted') return '/messages'
  if (kind === 'dating_match') return '/matchmaking?mode=dating'
  return null
}

function checkOperation(operation: PushOperation) {
  if (operation.controller.signal.aborted) throw new Error('Push registration cancelled')
}

// Native registration is device-global. A newer operation, logout or account change
// invalidates the old one, including continuations of plugin calls that cannot be aborted.
async function runPushOperation<T>(userId: string, signal: AbortSignal | undefined, work: (operation: PushOperation) => Promise<T>): Promise<T> {
  cancelPushOperations()
  const operation = { userId, controller: new AbortController() }
  activeOperation = operation
  const abort = () => operation.controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) abort()
  const timer = setTimeout(abort, REGISTRATION_TIMEOUT_MS)
  let onAbort: (() => void) | undefined
  try {
    checkOperation(operation)
    return await new Promise<T>((resolve, reject) => {
      onAbort = () => reject(new Error('Push registration cancelled or timed out'))
      operation.controller.signal.addEventListener('abort', onAbort, { once: true })
      void work(operation).then(resolve, reject)
    })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
    if (onAbort) operation.controller.signal.removeEventListener('abort', onAbort)
    if (activeOperation === operation) activeOperation = undefined
  }
}

async function sendToken(token: string, operation: PushOperation) {
  checkOperation(operation)
  await authorizedRequest('/api/push/devices', z.null(), { method: 'POST', body: { token, platform: 'android' }, signal: operation.controller.signal, expectedUserId: operation.userId })
  checkOperation(operation)
  remember(TOKEN_KEY, token)
}

// Asks the OS for a Firebase token. Resolves with it, or rejects if registration fails.
export function fetchPushToken(signal?: AbortSignal): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const handles: { remove(): Promise<void> }[] = []
    let settled = false
    const remove = (handle: { remove(): Promise<void> }) => { void Promise.resolve().then(() => handle.remove()).catch(() => undefined) }
    const finish = (error?: Error, token?: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      handles.forEach(remove)
      if (error) reject(error)
      else resolve(token!)
    }
    const abort = () => finish(new Error('Push registration cancelled or timed out'))
    const timer = setTimeout(abort, REGISTRATION_TIMEOUT_MS)
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) { abort(); return }
    const installed = (handle: { remove(): Promise<void> }) => {
      if (settled) remove(handle)
      else handles.push(handle)
    }
    // Both listeners must exist before register can emit a synchronous callback.
    void Promise.all([
      Promise.resolve().then(() => PushNotifications.addListener('registration', ({ value }) => finish(undefined, value))).then(installed),
      Promise.resolve().then(() => PushNotifications.addListener('registrationError', () => finish(new Error('Push registration failed')))).then(installed),
    ]).then(() => {
      if (!settled) return PushNotifications.register()
    }).catch(() => finish(new Error('Push registration failed')))
  })
}

export type EnablePushResult = 'enabled' | 'denied' | 'unsupported' | 'failed'

export async function enablePush(userId: string, signal?: AbortSignal): Promise<EnablePushResult> {
  if (!isNative()) return 'unsupported'
  if (signal?.aborted) return 'failed'
  try {
    return await runPushOperation(userId, signal, async operation => {
      let permission = await PushNotifications.checkPermissions()
      checkOperation(operation)
      if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') permission = await PushNotifications.requestPermissions()
      checkOperation(operation)
      if (permission.receive !== 'granted') return 'denied'
      await PushNotifications.createChannel({ id: CHANNEL_ID, name: 'Pebble', description: 'Messages and connection requests', importance: 4 })
      checkOperation(operation)
      await sendToken(await fetchPushToken(operation.controller.signal), operation)
      checkOperation(operation)
      // Commit before notifying subscribers: the bridge may immediately start a refresh.
      if (activeOperation === operation) activeOperation = undefined
      setPushEnabled(userId, true)
      return 'enabled'
    })
  } catch {
    return 'failed'
  }
}

// Best-effort server/native cleanup for disable and logout. Failure or timeout leaves delivery unconfirmed.
export async function unregisterPushToken(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error('Push cleanup cancelled')
  cancelPushOperations()
  const token = recall(TOKEN_KEY)
  // Forget immediately, including when cleanup stalls. Never retain another account's token.
  // Native deregistration deletes the Firebase token; it does not change the account's opt-in.
  remember(TOKEN_KEY, null)
  const controller = new AbortController()
  const abort = () => controller.abort()
  let onAbort!: () => void
  const interrupted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new Error('Push cleanup could not be confirmed'))
    controller.signal.addEventListener('abort', onAbort, { once: true })
  })
  signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, CLEANUP_TIMEOUT_MS)
  try {
    const results = await Promise.race([
      Promise.allSettled([
        Promise.resolve().then(() => { if (token) return authorizedRequest('/api/push/devices', z.null(), { method: 'DELETE', body: { token }, signal: controller.signal }) }),
        Promise.resolve().then(() => { if (isNative()) return PushNotifications.unregister() }),
      ]),
      interrupted,
    ])
    const failure = results.find(result => result.status === 'rejected')
    if (failure?.status === 'rejected') throw failure.reason
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
    controller.signal.removeEventListener('abort', onAbort)
  }
}

export async function disablePush(userId: string, signal?: AbortSignal) {
  if (signal?.aborted) throw new Error('Push cleanup cancelled')
  setPushEnabled(userId, false)
  await unregisterPushToken(signal)
}

// Re-sends the token at app start (Firebase can rotate it) when push is already on and allowed.
export async function refreshPushToken(userId: string, signal?: AbortSignal) {
  if (!isNative() || !isPushEnabled(userId) || signal?.aborted) return
  await runPushOperation(userId, signal, async operation => {
    const permission = await PushNotifications.checkPermissions()
    checkOperation(operation)
    if (permission.receive !== 'granted' || !isPushEnabled(userId)) return
    await sendToken(await fetchPushToken(operation.controller.signal), operation)
  })
}
