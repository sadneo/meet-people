import type { Page } from '@playwright/test'

// Stateful API fixture for UI tests; this is not database proof (see tests/*.sql).
export const messagingUser = 'a0000000-0000-4000-8000-000000000001'
const taylor = 'a0000000-0000-4000-8000-000000000002'
const jordan = 'a0000000-0000-4000-8000-000000000003'
export const riley = 'a0000000-0000-4000-8000-000000000004'
export const directConversation = 'c0000000-0000-4000-8000-000000000001'
export const groupConversation = 'c0000000-0000-4000-8000-000000000002'
const rileyConversation = 'c0000000-0000-4000-8000-000000000003'
const names: Record<string, string> = { [taylor]: 'Taylor', [jordan]: 'Jordan', [riley]: 'Riley' }

export async function mockMessagingApi(page: Page, { incomingFromRiley = false } = {}) {
  const conversations = [
    { id: directConversation, kind: 'direct', other: taylor },
    { id: groupConversation, kind: 'event_group', other: jordan },
  ]
  const rows = [{ id: 'b0000000-0000-4000-8000-000000000001', conversation_id: directConversation, seq: 1, sender_id: taylor, body: 'Previous saved message', created_at: '2026-10-08T12:00:00Z' }]
  const lastRead: Record<string, number> = {}
  const sends: unknown[] = []
  let incoming = incomingFromRiley ? [{ id: riley, display_name: 'Riley', avatar_url: null, requested_at: rows[0].created_at }] : []
  const participants = (id: string) => [
    { id: messagingUser, display_name: 'Sam', avatar_url: null, last_read_seq: lastRead[id] ?? 0 },
    ...conversations.filter(item => item.id === id).map(item => ({ id: item.other, display_name: names[item.other], avatar_url: null, last_read_seq: 0 })),
  ]
  const unread = (id: string) => rows.filter(row => row.conversation_id === id && row.seq > (lastRead[id] ?? 0) && row.sender_id !== messagingUser).length
  await page.route('**/api/connections**', route => {
    const request = route.request()
    const url = new URL(request.url())
    const id = url.pathname.split('/')[3]
    if (!id) return route.fulfill({ json: { incoming, sent: [], connected: [] } })
    incoming = incoming.filter(person => person.id !== id)
    if (!url.pathname.endsWith('/accept')) return route.fulfill({ json: { status: 'none', conversationId: null } })
    conversations.push({ id: rileyConversation, kind: 'direct', other: id })
    return route.fulfill({ json: { status: 'connected', conversationId: rileyConversation } })
  })
  await page.route('**/api/conversations**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const id = url.pathname.split('/')[3]
    const inConversation = rows.filter(row => row.conversation_id === id)
    if (id === 'activity') return route.fulfill({ json: { unreadConversations: conversations.filter(item => unread(item.id) > 0).length, incomingRequests: incoming.length } })
    if (request.method() === 'POST') {
      const payload = request.postDataJSON()
      if (url.pathname.endsWith('/read')) { lastRead[id] = payload.seq; return route.fulfill({ json: { lastReadSeq: payload.seq } }) }
      sends.push(payload)
      const message = { ...rows[0], id: crypto.randomUUID(), conversation_id: id, seq: (inConversation.at(-1)?.seq ?? 0) + 1, sender_id: messagingUser, body: payload.body, created_at: new Date().toISOString() }
      rows.push(message)
      lastRead[id] = message.seq
      return route.fulfill({ json: message })
    }
    if (url.pathname.endsWith('/messages')) {
      const after = Number(url.searchParams.get('after') ?? 0)
      const kind = conversations.find(item => item.id === id)?.kind ?? 'direct'
      return route.fulfill({ json: { kind, canSend: true, messages: inConversation.filter(row => row.seq > after), participants: participants(id), nextCursor: null } })
    }
    return route.fulfill({ json: { conversations: conversations.map(item => ({
      id: item.id, kind: item.kind, created_at: rows[0].created_at, participants: participants(item.id),
      latest_message: rows.filter(row => row.conversation_id === item.id).at(-1) ?? null, unread_count: unread(item.id),
    })), hasMore: false } })
  })
  return { sends }
}
