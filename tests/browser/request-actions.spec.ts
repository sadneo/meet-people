import { expect, test } from '@playwright/test'
import { conversationId, peer, wiringFixture } from './wiring-fixture'

for (const surface of ['/activity', '/messages/requests']) {
  for (const mode of ['friends', 'dating', null] as const) {
    test(`${surface} accepts ${mode ?? 'earlier'} requests through their original context`, async ({ page }) => {
      await wiringFixture(page)
      let pending = true
      const writes: string[] = []
      const person = { id: peer, display_name: 'Taylor', avatar_url: null, mode, requested_at: new Date().toISOString() }
      const expected = mode === 'dating' ? `/api/matchmaking/dating/requests/${peer}` : mode === 'friends' ? `/api/matchmaking/friends/requests/${peer}/accept` : `/api/connections/${peer}/accept`
      await page.route('**/api/connections', route => route.fulfill({ json: { incoming: pending ? [person] : [], sent: [], connected: pending ? [] : [{ ...person, conversationId }] } }))
      await page.route(`**${expected}`, route => {
        writes.push(new URL(route.request().url()).pathname)
        pending = false
        return route.fulfill({ json: { status: 'connected', conversationId } })
      })
      await page.goto(surface)
      await page.getByRole('button', { name: surface === '/messages/requests' && mode === 'dating' ? 'Like back' : 'Accept', exact: true }).click()
      await expect.poll(() => writes).toEqual([expected])
      if (surface === '/messages/requests') await expect(page).toHaveURL(new RegExp(`conversation=${conversationId}`))
      else await expect(page.getByText('No pending requests.', { exact: true })).toBeVisible()
    })
  }
}

test('Activity requires a read before allowing another action after an unconfirmed request', async ({ page }) => {
  await wiringFixture(page)
  let writes = 0
  await page.route('**/api/connections', route => route.fulfill({ json: { incoming: [{ id: peer, display_name: 'Taylor', avatar_url: null, mode: 'dating', requested_at: new Date().toISOString() }], sent: [], connected: [] } }))
  await page.route(`**/api/matchmaking/dating/requests/${peer}`, route => { writes++; return route.abort() })
  await page.goto('/activity')
  await page.getByRole('button', { name: 'Accept', exact: true }).click()
  await expect(page.getByText('The request response is unconfirmed. Refresh before another change.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Accept', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Decline', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Accept', exact: true })).toBeEnabled()
  expect(writes).toBe(1)
})

test('declining an Activity request refreshes the unread navigation badge', async ({ page }) => {
  await wiringFixture(page)
  let pending = true
  await page.route('**/api/connections', route => route.fulfill({ json: { incoming: pending ? [{ id: peer, display_name: 'Taylor', avatar_url: null, mode: 'friends', requested_at: new Date().toISOString() }] : [], sent: [], connected: [] } }))
  await page.route('**/api/conversations/activity', route => route.fulfill({ json: { incomingRequests: pending ? 1 : 0, unreadConversations: 0 } }))
  await page.route(`**/api/connections/${peer}`, route => { pending = false; return route.fulfill({ json: { status: 'none', conversationId: null } }) })
  await page.goto('/activity')
  const badge = page.getByRole('navigation', { name: 'Main navigation' }).getByLabel('Unread activity')
  await expect(badge).toBeVisible()
  await page.getByRole('button', { name: 'Decline', exact: true }).click()
  await expect(page.getByText('No pending requests.', { exact: true })).toBeVisible()
  await expect(badge).toHaveCount(0)
})

test('Activity keeps loaded portraits and long names within a narrow mobile screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await wiringFixture(page)
  const avatar = 'https://images.example.test/portrait.svg'
  const person = { id: peer, display_name: 'TaylorWithAnUnusuallyLongUnbrokenDisplayName', avatar_url: avatar, mode: 'friends', requested_at: new Date().toISOString() }
  await page.route('**/api/connections', route => route.fulfill({ json: { incoming: [person], sent: [], connected: [{ ...person, conversationId }] } }))
  await page.route(avatar, route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768"><rect width="1024" height="768" fill="#dfcbbd"/></svg>' }))
  await page.goto('/activity')
  const photos = page.locator('.activity-page .portrait')
  await expect(photos).toHaveCount(2)
  await expect.poll(() => photos.evaluateAll(images => images.every(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0))).toBe(true)
  expect(await photos.first().evaluate(image => image.getBoundingClientRect().width)).toBe(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
