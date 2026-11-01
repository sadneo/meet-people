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
  await expect(history.getByText('Incoming while chat stays open', { exact: true })).toBeVisible({ timeout: 12_000 })
  await expect(composer).toHaveValue('An unsent draft')
  await expect(composer).toBeFocused()
  expect(fixture.calls.filter(call => call.path.endsWith('/messages') && call.method === 'POST')).toHaveLength(0)
})
