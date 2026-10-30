import { expect, test } from '@playwright/test'
import { conversationId, peer, wiringFixture } from './wiring-fixture'

for (const width of [320, 390, 630]) {
  test(`Messages matches the mobile demo and keeps its composer reachable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await wiringFixture(page)
    await page.goto('/messages')
    await expect(page.getByRole('heading', { name: 'Messages', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Find a group', exact: true })).toHaveCSS('background-color', 'rgb(240, 228, 214)')
    await expect(page.getByLabel('Search conversations')).toHaveCSS('background-color', 'rgb(238, 232, 224)')
    await expect(page.locator('.contact-row')).toHaveCount(1)
    await expect(page.locator('.contact-row time')).not.toBeEmpty()
    await page.getByLabel('Search conversations').fill('nobody with this name')
    await expect(page.getByText('No conversations match', { exact: false })).toBeVisible()
    await expect(page.locator('.contact-row')).toHaveCount(0)
    await page.getByLabel('Search conversations').fill('Taylor')
    await page.locator('.contact-row').click()
    await expect(page).toHaveURL(new RegExp(conversationId))
    await expect(page.locator('.live-inbox')).toBeHidden()
    await expect(page.getByLabel('Message', { exact: true })).toBeVisible()
    const composer = (await page.locator('.live-composer').boundingBox())!
    const nav = (await page.getByRole('navigation', { name: 'Main navigation' }).boundingBox())!
    expect(composer.y + composer.height).toBeLessThanOrEqual(nav.y)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('link', { name: 'Back to conversations' }).click()
    await expect(page.getByLabel('Search conversations')).toBeVisible()
  })
}

test('Messages requests count comes from the activity API', async ({ page }) => {
  await wiringFixture(page)
  await page.route('**/api/conversations/activity', route => route.fulfill({ json: { incomingRequests: 2, unreadConversations: 1 } }))
  await page.goto('/messages')
  await expect(page.locator('.requests-link .request-count')).toHaveText('2')
  await page.locator('.requests-link').click()
  await expect(page).toHaveURL(/\/messages\/requests$/)
})

test('removing a connection requires confirmation and Cancel does not write', async ({ page }) => {
  const fixture = await wiringFixture(page)
  await page.goto(`/messages/chat?conversation=${conversationId}`)
  await page.getByLabel('Message', { exact: true }).waitFor()
  await page.getByLabel('Conversation options and safety').click()
  await page.getByRole('button', { name: 'Remove connection', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Remove connection?' })
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(fixture.calls.some(call => call.path === `/api/connections/${peer}` && call.method === 'DELETE')).toBe(false)
})

test('an unsent draft survives returning to the inbox and reopening its conversation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await wiringFixture(page)
  await page.goto('/messages')
  await page.locator('.contact-row').click()
  await page.getByLabel('Message', { exact: true }).fill('Unsent local draft')
  await page.getByRole('link', { name: 'Back to conversations' }).click()
  await page.locator('.contact-row').click()
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue('Unsent local draft')
})

for (const mode of ['friends', 'dating', null] as const) {
  test(`inbox uses recorded ${mode ?? 'unknown'} mode without guessing`, async ({ page }) => {
    await wiringFixture(page, { conversationMode: mode })
    await page.goto('/messages')
    const row = page.locator('.contact-row').first()
    await expect(row).toBeVisible()
    if (mode) await expect(row.locator('.connection-kind')).toHaveText(mode === 'friends' ? 'Friends' : 'Dating')
    else await expect(row.locator('.connection-kind')).toHaveCount(0)
    await expect(row).not.toContainText('Connection')
  })
}
