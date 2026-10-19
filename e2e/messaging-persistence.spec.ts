import { expect, test } from '@playwright/test'
import { mockMatchingApi, mockMatchingSession } from './matchmaking-fixture'
import { mockMessagingApi } from './messaging-fixture'

// UI integration test with an explicitly mocked session and API; this is not DB proof.
for (const width of [320, 390, 799, 800, 801, 1280, 1800]) {
  test(`saved messaging UI at ${width}px, refresh and conversation isolation`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 740 })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await mockMatchingSession(page)
    await mockMatchingApi(page)
    const api = await mockMessagingApi(page)
    await page.goto('/messages')
    const row = page.getByRole('button', { name: /Taylor.*Previous saved message/ })
    await expect(row.getByRole('img', { name: '1 unread' })).toBeVisible()
    await row.click()
    const history = page.getByRole('region', { name: 'Message history' })
    await expect(history.getByText('Previous saved message')).toBeVisible()
    await page.getByLabel('Message', { exact: true }).fill('M3 messaging persistence test')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(history.getByText('M3 messaging persistence test')).toBeVisible()
    expect(api.sends).toHaveLength(1)
    await page.reload()
    await expect(history.getByText('M3 messaging persistence test')).toBeVisible()
    await expect(page.getByRole('img', { name: /unread/ })).toHaveCount(0)
    await expect(page.locator('.pt-inbox-pane')).toBeVisible({ visible: width > 800 })
    // A one-on-one chat has no details column; the conversation takes its space.
    await expect(page.locator('.pt-chat-details')).toHaveCount(0)
    if (width > 800) {
      const workspace = (await page.locator('.pt-messages-workspace').boundingBox())!
      const pane = (await page.getByRole('region', { name: 'Selected conversation' }).boundingBox())!
      expect(Math.abs(pane.x + pane.width - (workspace.x + workspace.width))).toBeLessThanOrEqual(1)
    }
    const composer = await page.getByRole('form', { name: 'Send message' }).boundingBox()
    const nav = width <= 800 ? await page.locator('.pt-bottom-nav').boundingBox() : null
    expect(composer!.y + composer!.height).toBeLessThanOrEqual(nav?.y ?? 740)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    if (width === 390 || width === 1280) await page.screenshot({ path: testInfo.outputPath(`messages-${width}.png`) })
    if (width <= 800) await page.getByRole('link', { name: 'Back to messages', exact: true }).click()
    await page.getByRole('button', { name: /Jordan.*Say hello/ }).click()
    await expect(history.getByText('No messages yet. Say hello.')).toBeVisible()
    await expect(history.getByText('M3 messaging persistence test')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Leave conversation' })).toBeVisible()
    const details = page.getByRole('complementary', { name: 'Conversation details' })
    await expect(details.getByRole('heading', { name: 'Participants' })).toBeVisible({ visible: width > 800 })
    if (width > 800) await expect(details.getByText(/^(Sam \(you\)|Jordan|Casey)$/)).toHaveCount(3)
    await page.setViewportSize({ width, height: 560 })
    const shortComposer = await page.getByRole('form', { name: 'Send message' }).boundingBox()
    const shortNav = width <= 800 ? await page.locator('.pt-bottom-nav').boundingBox() : null
    expect(shortComposer!.y + shortComposer!.height).toBeLessThanOrEqual(shortNav?.y ?? 560)
    expect(errors).toEqual([])
  })
}
