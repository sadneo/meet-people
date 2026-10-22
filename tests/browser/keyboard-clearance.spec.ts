import { expect, test } from '@playwright/test'
import { mockMatchingApi, mockMatchingSession } from './matchmaking-fixture'

for (const width of [390, 768]) for (const safeArea of [0, 24]) {
  test(`focused controls clear compact navigation at ${width}px with ${safeArea}px safe area`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1024 })
    await mockMatchingSession(page)
    await mockMatchingApi(page)
    for (const route of ['/settings', '/matchmaking']) {
      await page.goto(route)
      await page.evaluate(value => document.body.style.setProperty('--pt-safe-area-bottom', `${value}px`), safeArea)
      const focused = route === '/settings' ? page.getByRole('button', { name: 'Mornings', exact: true }) : page.getByText('On this device', { exact: true })
      await expect(focused).toBeVisible()
      await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur() })
      for (let steps = 0; steps < 35; steps++) {
        await page.keyboard.press('Tab')
        if (await focused.evaluate(element => element === document.activeElement)) break
      }
      await expect(focused).toBeFocused()
      const navigation = (await page.locator('.pt-bottom-nav').boundingBox())!
      await expect.poll(async () => {
        const bounds = (await focused.boundingBox())!
        return bounds.y + bounds.height
      }, { message: `${route} focus remains visible above navigation` }).toBeLessThanOrEqual(navigation.y)
    }
  })
}
