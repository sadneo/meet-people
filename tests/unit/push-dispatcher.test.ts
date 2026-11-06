// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { createFcmSender, pushMessageFor, runPushCycle, type OutboxRow, type PushStore } from '../../api/push-dispatcher'
import { routeForPush } from '../../src/platform/push'

function memoryStore(rows: OutboxRow[], devices: Record<string, string[]>) {
  const sent: number[] = []
  const removed: string[] = []
  const store: PushStore = {
    claim: vi.fn(async () => rows),
    devices: vi.fn(async userId => devices[userId] ?? []),
    markSent: vi.fn(async ids => { sent.push(...ids) }),
    removeDevice: vi.fn(async token => { removed.push(token) }),
    prune: vi.fn(async () => undefined),
  }
  return { store, sent, removed }
}
const row = (id: number, user_id: string, attempts = 1, kind: OutboxRow['kind'] = 'message'): OutboxRow => ({ id, user_id, kind, attempts })

describe('push message text', () => {
  it('never contains names or message content', () => {
    for (const kind of ['message', 'connection_request', 'connection_accepted', 'dating_match'] as const) {
      const message = pushMessageFor(kind)
      expect(message.kind).toBe(kind)
      expect(`${message.title} ${message.body}`).not.toMatch(/\d|@/)
    }
  })
})

describe('runPushCycle', () => {
  it('sends to every device of the user and marks the row sent', async () => {
    const { store, sent } = memoryStore([row(1, 'u1')], { u1: ['t1', 't2'] })
    const send = vi.fn(async () => 'sent' as const)
    const result = await runPushCycle(store, send)
    expect(send).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({ claimed: 1, delivered: 2, retried: 0 })
    expect(sent).toEqual([1])
  })
  it('marks a row sent when the user has no devices (nothing to deliver)', async () => {
    const { store, sent } = memoryStore([row(1, 'u1')], {})
    const send = vi.fn(async () => 'sent' as const)
    await runPushCycle(store, send)
    expect(send).not.toHaveBeenCalled(); expect(sent).toEqual([1])
  })
  it('removes dead tokens and still completes the row', async () => {
    const { store, sent, removed } = memoryStore([row(1, 'u1')], { u1: ['dead', 'live'] })
    const send = vi.fn(async (token: string) => (token === 'dead' ? 'unregistered' : 'sent') as 'sent' | 'unregistered')
    const result = await runPushCycle(store, send)
    expect(removed).toEqual(['dead']); expect(sent).toEqual([1]); expect(result.removedDevices).toBe(1)
  })
  it('leaves a row for retry when nothing was delivered and the failure is temporary', async () => {
    const { store, sent } = memoryStore([row(1, 'u1', 1)], { u1: ['t1'] })
    const result = await runPushCycle(store, async () => 'retry')
    expect(sent).toEqual([]); expect(result.retried).toBe(1)
  })
  it('gives up after the maximum attempts', async () => {
    const { store, sent } = memoryStore([row(1, 'u1', 5)], { u1: ['t1'] })
    await runPushCycle(store, async () => 'retry', { maxAttempts: 5 })
    expect(sent).toEqual([1])
  })
  it('treats a thrown send as a retry, not a crash', async () => {
    const { store, sent } = memoryStore([row(1, 'u1', 1), row(2, 'u2', 1)], { u1: ['t1'], u2: ['t2'] })
    const send = vi.fn(async (token: string) => { if (token === 't1') throw new Error('network'); return 'sent' as const })
    const result = await runPushCycle(store, send)
    expect(sent).toEqual([2]); expect(result).toMatchObject({ delivered: 1, retried: 1 })
  })
  it('does not complete a row that partly delivered as a retry (no duplicate alert)', async () => {
    const { store, sent } = memoryStore([row(1, 'u1', 1)], { u1: ['ok', 'flaky'] })
    await runPushCycle(store, async token => (token === 'ok' ? 'sent' : 'retry'))
    expect(sent).toEqual([1])
  })
})

describe('createFcmSender', () => {
  const message = pushMessageFor('message')
  const make = (response: { status: number; body?: unknown }) => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(response.body ?? {}), { status: response.status }))
    return { fetchImpl, send: createFcmSender({ projectId: 'proj', getAccessToken: async () => 'access', fetchImpl: fetchImpl as never }) }
  }
  it('posts a generic notification with only the kind as data', async () => {
    const { fetchImpl, send } = make({ status: 200 })
    expect(await send('tok', message)).toBe('sent')
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://fcm.googleapis.com/v1/projects/proj/messages:send')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer access')
    const body = JSON.parse(init.body as string)
    expect(body.message).toMatchObject({ token: 'tok', data: { kind: 'message' }, android: { notification: { channel_id: 'default' } } })
    expect(Object.keys(body.message.data)).toEqual(['kind'])
  })
  it('reports dead tokens', async () => {
    expect(await make({ status: 404, body: { error: { status: 'NOT_FOUND' } } }).send('tok', message)).toBe('unregistered')
    expect(await make({ status: 400, body: { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } } }).send('tok', message)).toBe('unregistered')
    expect(await make({ status: 400, body: { error: { status: 'INVALID_ARGUMENT', message: 'The registration token is not a valid FCM registration token' } } }).send('tok', message)).toBe('unregistered')
  })
  it('never deletes a device because of our own payload or credential errors', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(await make({ status: 400, body: { error: { status: 'INVALID_ARGUMENT', message: 'Invalid JSON payload' } } }).send('tok', message)).toBe('retry')
    expect(await make({ status: 401, body: { error: { status: 'UNAUTHENTICATED' } } }).send('tok', message)).toBe('retry')
    expect(await make({ status: 503 }).send('tok', message)).toBe('retry')
    spy.mockRestore()
  })
})

describe('routeForPush', () => {
  it('opens known kinds and ignores anything else', () => {
    expect(routeForPush('message')).toBe('/messages')
    expect(routeForPush('connection_request')).toBe('/messages')
    expect(routeForPush('connection_accepted')).toBe('/messages')
    expect(routeForPush('dating_match')).toBe('/matchmaking?mode=dating')
    expect(routeForPush('https://evil.example')).toBeNull()
    expect(routeForPush(undefined)).toBeNull()
  })
})
