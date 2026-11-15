import type { SupabaseClient } from '@supabase/supabase-js'

export type PushKind = 'message' | 'connection_request' | 'connection_accepted' | 'dating_match'
export type OutboxRow = { id: number; user_id: string; kind: PushKind; attempts: number }
export type PushMessage = { kind: PushKind; title: string; body: string }
// 'sent' = delivered to FCM, 'unregistered' = token is dead (remove it), 'retry' = try again later.
export type SendResult = 'sent' | 'unregistered' | 'retry'
export type PushSender = (token: string, message: PushMessage) => Promise<SendResult>

export interface PushStore {
  claim(limit: number, leaseSeconds: number, maxAttempts: number): Promise<OutboxRow[]>
  devices(userId: string): Promise<string[]>
  markSent(ids: number[]): Promise<void>
  removeDevice(token: string): Promise<void>
  prune(): Promise<void>
}

// Lock screens and Google's servers see this text, so it never contains names or message content.
export function pushMessageFor(kind: PushKind): PushMessage {
  switch (kind) {
    case 'message': return { kind, title: 'New message', body: 'Open Pebble to read it.' }
    case 'connection_request': return { kind, title: 'New connection request', body: 'Someone would like to connect.' }
    case 'connection_accepted': return { kind, title: 'Request accepted', body: 'Someone accepted your connection request.' }
    case 'dating_match': return { kind, title: 'New match', body: 'Open Pebble to see it.' }
  }
}

export type CycleOptions = { batch?: number; leaseSeconds?: number; maxAttempts?: number }
export type CycleResult = { claimed: number; delivered: number; removedDevices: number; retried: number }

export async function runPushCycle(store: PushStore, send: PushSender, options: CycleOptions = {}): Promise<CycleResult> {
  const { batch = 50, leaseSeconds = 120, maxAttempts = 5 } = options
  const rows = await store.claim(batch, leaseSeconds, maxAttempts)
  const result: CycleResult = { claimed: rows.length, delivered: 0, removedDevices: 0, retried: 0 }
  const done: number[] = []
  for (const row of rows) {
    const message = pushMessageFor(row.kind)
    const tokens = await store.devices(row.user_id)
    let delivered = 0, retry = false
    for (const token of tokens) {
      let outcome: SendResult
      try { outcome = await send(token, message) } catch { outcome = 'retry' }
      if (outcome === 'sent') delivered++
      else if (outcome === 'unregistered') { await store.removeDevice(token); result.removedDevices++ }
      else retry = true
    }
    result.delivered += delivered
    // Nothing got through and something is retryable: leave the row; its lease expires and it is claimed again.
    if (delivered === 0 && retry && row.attempts < maxAttempts) { result.retried++; continue }
    done.push(row.id)
  }
  if (done.length) await store.markSent(done)
  await store.prune()
  return result
}

export function createSupabasePushStore(client: Pick<SupabaseClient, 'from' | 'rpc'>): PushStore {
  const fail = (what: string, error: { message: string } | null) => { if (error) throw new Error(`${what}: ${error.message}`) }
  return {
    async claim(limit, leaseSeconds, maxAttempts) {
      const { data, error } = await client.rpc('push_claim', { p_limit: limit, p_lease_seconds: leaseSeconds, p_max_attempts: maxAttempts })
      fail('claim', error)
      return (data ?? []) as OutboxRow[]
    },
    async devices(userId) {
      const { data, error } = await client.from('push_devices').select('token').eq('user_id', userId)
      fail('devices', error)
      return (data ?? []).map((row: { token: string }) => row.token)
    },
    async markSent(ids) {
      const { error } = await client.from('push_outbox').update({ sent_at: new Date().toISOString() }).in('id', ids)
      fail('markSent', error)
    },
    async removeDevice(token) {
      const { error } = await client.from('push_devices').delete().eq('token', token)
      fail('removeDevice', error)
    },
    async prune() {
      const day = 24 * 60 * 60 * 1000
      const { error } = await client.from('push_outbox').delete().lt('created_at', new Date(Date.now() - 3 * day).toISOString())
      fail('prune', error)
    },
  }
}

type ServiceAccount = { client_email: string; private_key: string }
export type FcmOptions = {
  projectId: string
  serviceAccount?: ServiceAccount
  getAccessToken?: () => Promise<string>
  fetchImpl?: typeof fetch
}

export function createFcmSender(options: FcmOptions): PushSender {
  const doFetch = options.fetchImpl ?? fetch
  let auth: { getAccessToken(): Promise<string | null | undefined> } | undefined
  const accessToken = options.getAccessToken ?? (async () => {
    if (!auth) {
      const { GoogleAuth } = await import('google-auth-library')
      // Cloud Run uses its attached runtime identity through ADC; a downloaded
      // long-lived service-account key is not required for hosted dispatch.
      auth = new GoogleAuth({ credentials: options.serviceAccount, scopes: ['https://www.googleapis.com/auth/firebase.messaging'] })
    }
    const token = await auth.getAccessToken()
    if (!token) throw new Error('No Firebase access token')
    return token
  })
  const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(options.projectId)}/messages:send`
  return async (token, message) => {
    const response = await doFetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: {
        token,
        notification: { title: message.title, body: message.body },
        data: { kind: message.kind },
        android: { priority: 'HIGH', notification: { channel_id: 'default' } },
      } }),
    })
    if (response.ok) return 'sent'
    const detail = await response.json().catch(() => null) as { error?: { status?: string; message?: string; details?: { errorCode?: string }[] } } | null
    const code = detail?.error?.details?.find(item => item.errorCode)?.errorCode ?? detail?.error?.status
    // Only remove a device when FCM says the token itself is dead, never because of our own payload/config errors.
    if (code === 'UNREGISTERED') return 'unregistered'
    if (response.status === 400 && /registration token/i.test(detail?.error?.message ?? '')) return 'unregistered'
    console.error('FCM send failed', { status: response.status, code })
    return 'retry'
  }
}
