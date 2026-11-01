import { expect, test, type Page } from '@playwright/test'
import { conversationId, peer, wiringFixture } from './wiring-fixture'

async function requestFixture(page: Page, failAccept = false, mode: 'friends' | 'dating' | null = 'friends') {
  await wiringFixture(page)
  let pending = true, writes = 0
  await page.route('**/api/connections', route => route.fulfill({ json: { incoming: pending ? [{ id: peer, display_name: 'Taylor', avatar_url: null, requested_at: new Date().toISOString(), mode }] : [], sent: [], connected: [] } }))
  await page.route(`**/api/matchmaking/friends/requests/${peer}/accept`, route => {
    writes++
    if (failAccept) return route.abort()
    pending = false
    return route.fulfill({ json: { status: 'connected', conversationId } })
  })
  await page.route(`**/api/connections/${peer}`, route => {
    if (route.request().method() === 'DELETE') { writes++; pending = false }
    return route.fulfill({ json: { status: pending ? 'incoming' : 'none', conversationId: null } })
  })
  return { writes: () => writes }
}

for (const width of [320, 390, 630]) {
  test(`Requests follows the standalone reference at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 980 })
    await requestFixture(page)
    await page.goto('/messages/requests')
    await expect(page.getByRole('heading', { name: 'Requests', exact: true })).toBeVisible()
    await expect(page.locator('.requests-page')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Taylor', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Accept', exact: true })).toHaveCSS('background-color', 'rgb(157, 80, 61)')
    await expect(page.getByRole('button', { name: 'Decline', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('link', { name: 'Close requests' }).click()
    await expect(page).toHaveURL(/\/messages$/)
  })
}

test('Accept opens the confirmed conversation', async ({ page }) => {
  const fixture = await requestFixture(page)
  await page.goto('/messages/requests')
  await page.getByRole('button', { name: 'Accept', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`conversation=${conversationId}`))
  expect(fixture.writes()).toBe(1)
})

test('Decline removes the pending request through the real contract', async ({ page }) => {
  const fixture = await requestFixture(page)
  await page.goto('/messages/requests')
  await page.getByRole('button', { name: 'Decline', exact: true }).click()
  await expect(page.getByText('No pending requests.', { exact: true })).toBeVisible()
  expect(fixture.writes()).toBe(1)
})

test('an uncertain request response requires read-only reconciliation before another action', async ({ page }) => {
  const fixture = await requestFixture(page, true)
  await page.goto('/messages/requests')
  await page.getByRole('button', { name: 'Accept', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Decline', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Reload requests', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Decline', exact: true })).toBeEnabled()
  expect(fixture.writes()).toBe(1)
})

test('Friends and Dating request sections collapse independently', async ({ page }) => {
  await requestFixture(page)
  await page.route('**/api/connections', route => route.fulfill({ json: { incoming: [
    { id: peer, display_name: 'Taylor', avatar_url: null, requested_at: new Date().toISOString(), mode: 'friends' },
    { id: 'a0000000-0000-4000-8000-000000000003', display_name: 'Jordan', avatar_url: null, requested_at: new Date().toISOString(), mode: 'dating' },
  ], sent: [], connected: [] } }))
  await page.goto('/messages/requests')
  const friends = page.locator('.requests-group.friends'), dating = page.locator('.requests-group.dating')
  await expect(friends.locator('.request-count')).toHaveText('1')
  await expect(dating.locator('.request-count')).toHaveText('1')
  await friends.locator('summary').click()
  await expect(friends.getByRole('heading', { name: 'Taylor' })).toBeHidden()
  await expect(dating.getByRole('heading', { name: 'Jordan' })).toBeVisible()
  await friends.locator('summary').click()
  await expect(friends.getByRole('heading', { name: 'Taylor' })).toBeVisible()
})

test('Dating Like back uses the reciprocal Dating endpoint, not Friends acceptance', async ({ page }) => {
  await requestFixture(page, false, 'dating')
  let likes = 0
  await page.route(`**/api/matchmaking/dating/requests/${peer}`, route => { likes++; return route.fulfill({ json: { status: 'connected', conversationId } }) })
  await page.goto('/messages/requests')
  await page.getByRole('button', { name: 'Like back', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`conversation=${conversationId}`))
  expect(likes).toBe(1)
})

test('the safety sheet fills the mobile viewport and keeps its action visible', async ({ page }) => {
  await page.setViewportSize({ width: 630, height: 980 })
  await requestFixture(page)
  await page.goto('/messages/requests')
  await page.getByRole('button', { name: 'Block or report' }).click()
  const dialog = page.getByRole('dialog', { name: 'Safety · Taylor' })
  await expect(dialog.getByRole('button', { name: 'Send report' })).toBeVisible()
  const bounds = (await dialog.boundingBox())!
  expect(Math.abs(bounds.x + bounds.width / 2 - 315)).toBeLessThan(1)
  expect(Math.abs(bounds.y + bounds.height / 2 - 490)).toBeLessThan(1)
  expect(bounds.height).toBe(980)
})
