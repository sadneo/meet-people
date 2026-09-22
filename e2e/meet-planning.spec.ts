import { expect, test } from '@playwright/test'

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  test(`plans and edits a meetup at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/chats/plan')
    await expect(page.getByRole('link', { name: 'Chats' })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('button', { name: 'Choose an activity' })).toBeDisabled()
    await expect(page.getByRole('radio', { name: /Jamie is in class/ })).toBeDisabled()

    async function checkFit(action: string) {
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width)
      for (const button of await page.getByRole('button').all()) {
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44)
      }
      const actionBox = (await page.getByRole('button', { name: action, exact: true }).boundingBox())!
      const navBox = (await page.getByRole('navigation', { name: 'Primary navigation' }).boundingBox())!
      expect(actionBox.y).toBeGreaterThanOrEqual(0)
      expect(actionBox.y + actionBox.height).toBeLessThanOrEqual(navBox.y)
    }

    await checkFit('Choose an activity')
    await page.getByRole('radio', { name: /Tue, Sep 29/ }).focus()
    await page.keyboard.press('ArrowDown')
    const laterTime = page.getByRole('radio', { name: /Wed, Sep 30/ })
    await expect(laterTime).toBeFocused()
    expect(await laterTime.evaluate((node) => {
      const box = node.getBoundingClientRect()
      return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === node
    })).toBe(true)
    await page.getByRole('radio', { name: /Tue, Sep 29/ }).check()
    await page.getByRole('button', { name: 'Choose an activity' }).click()
    await expect(page.getByRole('heading', { name: 'Choose an activity' })).toBeFocused()
    await checkFit('Review plan')
    await page.getByRole('radio', { name: 'Coffee & conversation' }).check()
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(page.getByRole('radio', { name: /Tue, Sep 29/ })).toBeChecked()
    await page.getByRole('radio', { name: /Wed, Sep 30/ }).check()
    await page.getByRole('button', { name: 'Choose an activity' }).click()
    await expect(page.getByRole('radio', { name: 'Coffee & conversation' })).toBeChecked()
    await page.getByRole('button', { name: 'Review plan' }).click()
    await expect(page.getByText('Wednesday, September 30, 2026')).toBeVisible()
    await checkFit('Make plan')
    await page.getByRole('button', { name: 'Make plan', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Your plan is ready' })).toBeVisible()
    await checkFit('Edit plan')
    await page.getByRole('button', { name: 'Edit plan' }).click()
    await page.getByRole('button', { name: 'Change activity' }).click()
    await page.getByRole('radio', { name: 'A quick card game' }).check()
    await page.getByRole('button', { name: 'Review plan' }).click()
    await page.getByRole('button', { name: 'Make plan', exact: true }).click()
    await expect(page.getByText('Meet at the lounge entrance. You bring the cards.')).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Choose an activity' })).toBeDisabled()
    expect(errors).toEqual([])
  })
}

test('supports keyboard-only planning, larger text, and reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 480 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/chats/plan')
  await page.addStyleTag({ content: 'html { font-size: 200%; }' })
  await expect(page.getByRole('heading', { name: 'Choose a shared time' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('radio', { name: /Tue, Sep 29/ })).toBeFocused()
  await page.keyboard.press('Space')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Choose an activity' })).toBeFocused()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Space')
  await page.keyboard.press('Tab') // Back
  await page.keyboard.press('Tab') // Review plan
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Review your plan' })).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(640)
  await page.keyboard.press('Tab') // Change time
  await page.keyboard.press('Tab') // Change activity
  await page.keyboard.press('Tab') // Make plan
  const makePlan = page.getByRole('button', { name: 'Make plan', exact: true })
  await expect(makePlan).toBeFocused()
  expect(await makePlan.evaluate((node) => getComputedStyle(node).transitionDuration)).toBe('0s')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Your plan is ready' })).toBeFocused()
})
