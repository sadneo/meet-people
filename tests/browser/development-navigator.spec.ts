import { expect, test } from '@playwright/test'
import { conversationId, peer, wiringFixture } from './wiring-fixture'

test('development navigator switches views, closes after navigation and supports Escape on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await wiringFixture(page)
  await page.goto('/home')
  const navigator = page.getByRole('complementary', { name: 'Development navigation' })
  await navigator.locator('summary').click()
  await navigator.getByLabel('Jump to a view').selectOption('/profile')
  await expect(page).toHaveURL(/\/profile$/)
  await expect(navigator.locator('details')).not.toHaveAttribute('open')
  await navigator.locator('summary').click()
  await navigator.getByLabel('Jump to a view').focus()
  await page.keyboard.press('Escape')
  await expect(navigator.locator('details')).not.toHaveAttribute('open')
  await expect(navigator.locator('summary')).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('development navigator preserves private route sign-in gates', async ({ page }) => {
  await wiringFixture(page, { guest: true })
  await page.goto('/login')
  const navigator = page.getByRole('complementary', { name: 'Development navigation' })
  await navigator.locator('summary').click()
  await navigator.getByLabel('Jump to a view').selectOption('/messages')
  await expect(page).toHaveURL(/\/login\?returnTo=/)
  await expect(page.getByRole('heading', { name: 'Welcome to Pebble', exact: true })).toBeVisible()
})

for (const width of [320, 390]) {
  test(`development tools never obstruct mobile Undo or the composer at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await wiringFixture(page)
    await page.route('**/api/matchmaking/friends/recommendations', route => route.fulfill({ json: {
      algorithmVersion: 'friends-rules-v1', candidates: [peer, 'a0000000-0000-4000-8000-000000000003'].map((id, index) => ({
        id, name: index ? 'Jordan' : 'Taylor', age: 23, city: null, bio: null, avatar: null, photoRevision: 0, interests: ['Coffee'], areaDistanceMiles: 2,
      })),
    } }))
    await page.goto('/matchmaking')
    const navigator = page.getByRole('complementary', { name: 'Development navigation' })
    await expect(navigator).toHaveCSS('position', 'relative')
    await page.getByRole('button', { name: 'Pass', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Jordan, 23' })).toBeVisible()
    await page.getByRole('button', { name: 'Undo skip', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Taylor, 23' })).toBeVisible()
    await page.goto(`/messages/chat?conversation=${conversationId}`)
    const composer = page.getByRole('textbox', { name: 'Message', exact: true })
    await composer.click()
    await composer.fill('An unobstructed draft')
    await expect(composer).toBeFocused()
    const toolbar = (await navigator.boundingBox())!
    const field = (await composer.boundingBox())!
    expect(toolbar.y + toolbar.height).toBeLessThanOrEqual(field.y)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
