import { expect, test } from '@playwright/test'
import { peer, user, wiringFixture } from './wiring-fixture'

for (const width of [390, 1280]) {
  test(`group history remains reachable after refreshing group details at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await wiringFixture(page)
    const groupId = 'b0000000-0000-4000-8000-000000000001'
    const createdAt = '2026-11-24T00:00:00Z'
    const message = (seq: number, body: string) => ({
      id: crypto.randomUUID(), conversation_id: groupId, seq, sender_id: peer, body, created_at: createdAt,
    })
    const first = message(1, 'Our original meeting spot')
    const last = message(2, 'See you soon')
    const group = {
      id: groupId, name: 'Coffee crew', targetSize: 3, kind: 'friends_group', createdAt,
      latestMessage: last, unreadCount: 0, searchState: 'idle', readyMemberIds: [],
      members: [user, peer].map((id, i) => ({ id, display_name: i ? 'Taylor' : 'Sam', last_read_seq: 2, avatar_url: null })),
    }
    await page.route('**/api/matchmaking/active-friends/groups**', route => {
      const { pathname, searchParams } = new URL(route.request().url())
      if (pathname.endsWith('/groups')) return route.fulfill({ json: { groups: [group] } })
      if (pathname.endsWith('/read')) return route.fulfill({ json: { lastReadSeq: 2 } })
      if (pathname.endsWith('/messages')) {
        return route.fulfill({ json: searchParams.get('before') === '2'
          ? { messages: [first], nextCursor: null } : { messages: [last], nextCursor: 2 } })
      }
      return route.fulfill({ json: group })
    })
    await page.goto(`/messages/chat?group=${groupId}`)
    const earlier = page.getByRole('button', { name: 'Load earlier messages' })
    await earlier.click()
    const firstBubble = page.getByRole('log').getByText(first.body)
    await expect(firstBubble).toBeVisible()
    await expect(earlier).toHaveCount(0)
    await page.getByText('Group details & ready-up', { exact: true }).click()
    await page.getByRole('button', { name: 'Refresh group' }).click()
    await expect(firstBubble).toHaveCount(0)
    await page.getByText('Group details & ready-up', { exact: true }).click()
    if (process.env.QA_EVIDENCE_DIR) await page.screenshot({ path: `${process.env.QA_EVIDENCE_DIR}/MSG-history-${width}.png` })
    await earlier.click({ timeout: 3000 })
    await expect(firstBubble).toBeVisible()
    await expect(earlier).toHaveCount(0)
  })
}
