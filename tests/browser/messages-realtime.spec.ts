import { expect, test } from '@playwright/test'
import { conversationId, peer, user, wiringFixture } from './wiring-fixture'

test('an open conversation receives a new message without refresh and keeps its focused draft', async ({ page }) => {
  const fixture = await wiringFixture(page)
  const messages = [{ id: 'b0000000-0000-4000-8000-000000000001', conversation_id: conversationId, seq: 1, sender_id: peer, body: 'Initial message', created_at: '2026-10-31T12:00:00Z' }]
  await page.route(`**/api/conversations/${conversationId}/messages`, route => {
    if (route.request().method() !== 'GET') return route.fallback()
    return route.fulfill({ json: { kind: 'direct', canSend: true, messages, nextCursor: null, participants: [
      { id: user, display_name: 'Sam', avatar_url: null, last_read_seq: 0 },
      { id: peer, display_name: 'Taylor', avatar_url: null, last_read_seq: 0 },
    ] } })
  })
  await page.goto(`/messages/chat?conversation=${conversationId}`)
  const history = page.getByRole('log', { name: 'Message history' })
  await expect(history.getByText('Initial message', { exact: true })).toBeVisible()
  const composer = page.getByRole('textbox', { name: 'Message', exact: true })
  await composer.fill('An unsent draft')
  messages.push({ ...messages[0], id: 'b0000000-0000-4000-8000-000000000002', seq: 2, body: 'Incoming while chat stays open' })
  await page.evaluate(() => window.dispatchEvent(new Event('test:messaging-broadcast')))
  await expect(history.getByText('Incoming while chat stays open', { exact: true })).toBeVisible({ timeout: 12_000 })
  await expect(composer).toHaveValue('An unsent draft')
  await expect(composer).toBeFocused()
  expect(fixture.calls.filter(call => call.path.endsWith('/messages') && call.method === 'POST')).toHaveLength(0)
})

test('reconnecting catches up without periodic HTTP history reads', async ({ page }) => {
  const fixture = await wiringFixture(page)
  await page.goto(`/messages/chat?conversation=${conversationId}`)
  await expect(page.getByRole('log').getByText('A real saved hello', { exact: true })).toBeVisible()
  const reads = () => fixture.calls.filter(call => call.path.endsWith('/messages') && call.method === 'GET').length
  // Let subscription catch-up and its read receipt finish before measuring idle reads.
  await page.waitForTimeout(500)
  const before = reads()
  await page.waitForTimeout(4500)
  expect(reads()).toBe(before)
  await page.evaluate(() => window.dispatchEvent(new Event('test:messaging-reconnected')))
  await expect.poll(reads).toBeGreaterThan(before)
})

test('typing dots are scoped to the current chat and expire without touching a draft', async ({ page }) => {
  await wiringFixture(page)
  await page.goto(`/messages/chat?conversation=${conversationId}`)
  await expect(page.getByRole('log')).toBeVisible()
  const emit = (conversation: string, typing = true, userId = peer) => page.evaluate(payload => {
    window.dispatchEvent(new CustomEvent('test:messaging-typing', { detail: payload }))
  }, { conversationId: conversation, userId, isGroup: false, typing })
  await emit('b0000000-0000-4000-8000-000000000099')
  await emit(conversationId, true, user)
  await expect(page.getByRole('status', { name: /is typing/ })).toHaveCount(0)
  await emit(conversationId)
  const indicator = page.getByRole('status', { name: 'Taylor is typing', exact: true })
  await expect(indicator).toBeVisible()
  await emit(conversationId, false)
  await expect(indicator).toHaveCount(0)
  await emit(conversationId)
  await expect(indicator).toBeVisible()
  await expect(indicator).toHaveCount(0, { timeout: 7000 })
})

test('sending typing activity excludes message text and clears when the composer loses focus', async ({ page }) => {
  await wiringFixture(page)
  const flags: unknown[] = []
  await page.route(`**/api/conversations/${conversationId}/typing`, route => {
    flags.push(route.request().postDataJSON())
    return route.fulfill({ json: { ok: true } })
  })
  await page.goto(`/messages/chat?conversation=${conversationId}`)
  const composer = page.getByRole('textbox', { name: 'Message', exact: true })
  await composer.fill('This draft must stay private')
  await expect.poll(() => flags).toContainEqual({ isGroup: false, typing: true })
  await page.getByRole('button', { name: 'View conversation members', exact: true }).focus()
  await expect.poll(() => flags.at(-1)).toEqual({ isGroup: false, typing: false })
  await expect(composer).toHaveValue('This draft must stay private')
  expect(JSON.stringify(flags)).not.toContain('This draft')
})

test('a peer read receipt changes Sent to Read without refreshing the page', async ({ page }) => {
  await wiringFixture(page)
  let read = 0
  await page.route(`**/api/conversations/${conversationId}/messages`, route => route.fulfill({ json: {
    kind: 'direct', canSend: true, nextCursor: null,
    messages: [{ id: 'b0000000-0000-4000-8000-000000000010', conversation_id: conversationId, seq: 10, sender_id: user, body: 'Waiting for a read receipt', created_at: new Date().toISOString() }],
    participants: [{ id: user, display_name: 'Sam', avatar_url: null, last_read_seq: 10 }, { id: peer, display_name: 'Taylor', avatar_url: null, last_read_seq: read }],
  } }))
  await page.goto(`/messages/chat?conversation=${conversationId}`)
  await expect(page.getByRole('log').getByText(/· Sent/)).toBeVisible()
  read = 10
  await page.evaluate(() => window.dispatchEvent(new Event('test:messaging-broadcast')))
  await expect(page.getByRole('log').getByText(/· Read/)).toBeVisible()
})
