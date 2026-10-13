import { expect, test } from '@playwright/test'
import { COMMUNITY_STORAGE_KEY, upgrades } from '../src/features/prototype/economy'

for (const [width, height] of [[390, 844], [1280, 720]]) {
  test(`cumulative history and centered area controls at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.addInitScript(({ key, owned }) => localStorage.setItem(key, JSON.stringify({ balance: 25, owned, earnedChapters: [] })), { key: COMMUNITY_STORAGE_KEY, owned: upgrades.map(upgrade => upgrade.id) })
    await page.goto('/community')
    const control = page.getByRole('button', { name: 'Explore geology museum' })
    await expect(control).toHaveText('')
    await expect.poll(async () => { const box = (await control.boundingBox())!; return Math.round(box.y + box.height / 2) }).toBe(height / 2)
    const bars = page.getByRole('group', { name: 'Select a day' }).getByRole('button')
    const objects = page.locator('.pt-diorama [data-object]')
    let previous: (string | null)[] = []
    for (let day = 0; day < 7; day++) {
      await bars.nth(day).click()
      const current = await objects.evaluateAll(els => els.map(el => el.getAttribute('data-object')))
      expect(current).toEqual(expect.arrayContaining(previous))
      if (day === 0) {
        expect(current).toEqual(['pebble'])
        await expect(page.locator('.pt-diorama [data-terrain], .pt-diorama [data-upgrade]')).toHaveCount(0)
        await page.screenshot({ path: `/tmp/pebble-refine-${width}-sunday.png` })
      }
      previous = current
    }
    await expect(page.locator('.pt-diorama [data-upgrade]')).toHaveCount(upgrades.length)
    await page.screenshot({ path: `/tmp/pebble-refine-${width}-saturday.png` })
    await control.click()
    await expect(page.locator('.pt-museum-zone')).toHaveAttribute('aria-hidden', 'false')
    await expect.poll(() => page.locator('.pt-community-panels').evaluate(el => Math.abs(el.scrollLeft - el.clientWidth))).toBeLessThan(2)
    await expect(page.getByRole('button', { name: 'Build your community', exact: true })).toHaveCount(0)
    await page.screenshot({ path: `/tmp/pebble-refine-${width}-museum.png` })
    await page.getByRole('button', { name: 'Back to village' }).click()
    await expect(page.getByRole('button', { name: 'Build your community', exact: true })).toBeVisible()
    await expect(page.getByLabel('Pebble balance', { exact: true })).toContainText('25')
    await bars.first().click()
    await expect(objects).toHaveCount(1)
  })
}
