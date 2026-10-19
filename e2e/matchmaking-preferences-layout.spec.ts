import { expect, test } from '@playwright/test'
import { mockMatchingApi, mockMatchingSession } from './matchmaking-fixture'

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
  test(`matching preferences keep useful fields visible and actions compact at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await mockMatchingSession(page)
    await mockMatchingApi(page)
    await page.goto('/matchmaking')
    await page.getByRole('button', { name: 'Preferences', exact: true }).click()
    const dialog = page.getByRole('dialog')
    const heading = await dialog.getByRole('heading', { name: 'Your preferences' }).boundingBox()
    const save = await dialog.getByRole('button', { name: 'Save preferences' }).boundingBox()
    expect(heading!.height).toBeLessThan(40)
    expect(save!.height).toBeLessThanOrEqual(52)
    const fieldsFit = await dialog.evaluate(element => {
      const body = element.querySelector('.match-preferences-body')!.getBoundingClientRect()
      const fields = [...element.querySelectorAll('input')].slice(0, 2).map(input => input.getBoundingClientRect())
      return fields.every(field => field.top >= body.top && field.bottom <= body.bottom)
    })
    expect(fieldsFit).toBe(true)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Preferences', exact: true })).toBeFocused()
  })
}
