import { expect, test, type Page } from '@playwright/test'
import { mockMatchingApi, mockMatchingSession } from './matchmaking-fixture'
import { mockMessagingApi } from './messaging-fixture'

// Mocked session and API: UI behaviour only. SQL behaviour: tests/connections.sql.
const navigation = (page: Page, width: number) => page.locator(width <= 800 ? '.pt-bottom-nav' : '.pt-desktop-nav')

for (const width of [390, 1280]) {
  test(`accepting a connection request opens the new chat at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 800 })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await mockMatchingSession(page)
    await mockMatchingApi(page)
    await mockMessagingApi(page, { incomingFromRiley: true })
    await page.goto('/')
    const messagesTab = navigation(page, width).getByRole('link', { name: 'Messages', exact: true })
    await expect(messagesTab.locator('.pt-nav-activity')).toBeVisible()
    await messagesTab.click()
    const requests = page.getByRole('region', { name: 'Connection requests' })
    await expect(requests.getByText('Riley')).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath(`requests-${width}.png`) })
    await requests.getByRole('button', { name: 'Accept' }).click()
    await expect(page).toHaveURL(/conversation=c0000000-0000-4000-8000-000000000003/)
    await expect(page.locator('.pt-chat-identity')).toContainText('Riley')
    await expect(requests).toHaveCount(0)
    // Taylor's message is still unread, so the dot stays until it is read.
    await expect(messagesTab.locator('.pt-nav-activity')).toBeVisible()
    if (width <= 800) await page.getByRole('link', { name: 'Back to messages', exact: true }).click()
    await page.getByRole('button', { name: /Taylor.*Previous saved message/ }).click()
    await expect(page.getByRole('region', { name: 'Message history' }).getByText('Previous saved message')).toBeVisible()
    await expect(messagesTab.locator('.pt-nav-activity')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect(errors).toEqual([])
  })
}

test('a suggested match can be asked to connect, and the request cancelled', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockMatchingSession(page)
  await mockMatchingApi(page)
  await page.route('**/api/matchmaking/result', route => route.fulfill({ json: { candidate: { id: 'a0000000-0000-4000-8000-000000000002', name: 'Taylor', avatar: null, interests: ['Coffee'], overlap: 'some', mode: 'active', meetup: null } } }))
  await page.goto('/matchmaking')
  await page.getByRole('button', { name: 'Start matching', exact: true }).click()
  await page.getByRole('button', { name: 'Check for a match' }).click()
  await expect(page.getByRole('heading', { name: 'Taylor' })).toBeVisible()
  await page.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(page.getByText('Request sent')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('candidate-request-sent.png') })
  await page.getByRole('button', { name: 'Cancel request' }).click()
  await expect(page.getByRole('button', { name: 'Connect', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
