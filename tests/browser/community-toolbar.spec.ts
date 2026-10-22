import { expect, test } from '@playwright/test'
import { mockMatchingApi, mockMatchingSession } from './matchmaking-fixture'

for (const [width, height] of [[320, 568], [390, 844], [800, 900], [801, 900]]) {
  test(`signed-in Community keeps its toolbar and week controls clear at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockMatchingSession(page)
    await mockMatchingApi(page)
    await page.goto('/community')
    const bell = page.getByRole('button', { name: /Matching notifications,/ })
    await expect(bell).toBeVisible()
    const controls = [page.getByRole('link', { name: 'Back to Home', exact: true }), bell, page.getByLabel('Pebble balance', { exact: true }), page.getByRole('button', { name: 'Build your community', exact: true })]
    const boxes = await Promise.all(controls.map(control => control.boundingBox()))
    expect(Math.abs(boxes[0]!.y - boxes[1]!.y), 'bell shares the existing Community toolbar').toBeLessThanOrEqual(4)
    for (let index = 0; index < boxes.length; index++) {
      const box = boxes[index]!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(width)
      for (const other of boxes.slice(index + 1)) {
        const overlap = box.x < other!.x + other!.width && box.x + box.width > other!.x && box.y < other!.y + other!.height && box.y + box.height > other!.y
        expect(overlap, 'toolbar controls do not overlap').toBe(false)
      }
    }
    const dates = (await page.locator('.pt-history-dates').boundingBox())!
    const navigation = await page.locator('.pt-bottom-nav').boundingBox()
    expect(dates.y + dates.height, 'week controls clear compact navigation').toBeLessThanOrEqual(navigation?.y ?? height)
    await bell.click()
    await expect(page.getByRole('dialog', { name: 'Matching notifications', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(bell).toBeFocused()
    await page.getByRole('button', { name: 'Build your community', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Build your community', exact: true })).toBeVisible()
  })
}
