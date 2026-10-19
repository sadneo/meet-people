import { expect, test } from '@playwright/test'
import { mockMatchingApi, mockMatchingSession } from './matchmaking-fixture'
import { directConversation, mockMessagingApi } from './messaging-fixture'

for (const [width, height] of [[320, 568], [390, 844], [800, 844], [801, 844], [1280, 720], [1920, 1080]]) {
  test(`an unset profile photo remains fully visible across the cover at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await mockMatchingSession(page)
    await mockMatchingApi(page)
    await page.goto('/profile')
    // Expanded layouts repeat the same avatar name in the account menu.
    const region = page.getByRole('region', { name: 'Your profile' })
    const avatar = region.getByRole('img', { name: 'Sam profile picture not set' })
    await expect(avatar).toBeVisible()
    const portrait = (await avatar.boundingBox())!
    const summary = (await region.boundingBox())!
    const cover = (await page.locator('.pt-profile-cover').boundingBox())!
    expect(portrait.y, 'the card must not clip the top of the silhouette').toBeGreaterThanOrEqual(summary.y)
    expect(portrait.x).toBeGreaterThanOrEqual(summary.x)
    expect(portrait.x + portrait.width).toBeLessThanOrEqual(summary.x + summary.width)
    expect(portrait.y).toBeLessThan(cover.y + cover.height)
    expect(portrait.y + portrait.height, 'the portrait spans the cover/body boundary').toBeGreaterThan(cover.y + cover.height)
  })
}

for (const width of [801, 1024, 1280]) {
  test(`Messages and Refresh remain separately readable in the expanded inbox at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 })
    await mockMatchingSession(page)
    await mockMatchingApi(page)
    await mockMessagingApi(page)
    for (const path of ['/messages', `/messages/chat?conversation=${directConversation}`]) {
      await page.goto(path)
      // The signed-in inbox replaces a loading heading that has no Refresh action.
      const inbox = page.getByRole('region', { name: 'Conversation inbox' })
      const refresh = inbox.getByRole('button', { name: 'Refresh', exact: true })
      await expect(refresh).toBeEnabled()
      const button = (await refresh.boundingBox())!
      const title = await inbox.getByRole('heading', { name: 'Messages', exact: true }).evaluate(element => {
        const range = document.createRange()
        range.selectNodeContents(element)
        return range.getBoundingClientRect().toJSON() as { left: number; right: number; top: number; bottom: number }
      })
      const overlap = Math.max(0, Math.min(title.right, button.x + button.width) - Math.max(title.left, button.x))
        * Math.max(0, Math.min(title.bottom, button.y + button.height) - Math.max(title.top, button.y))
      expect(overlap, `${path}: Refresh must not cover heading text`).toBe(0)
    }
  })
}
