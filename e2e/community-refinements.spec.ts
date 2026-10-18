import { expect, test } from '@playwright/test'
import { COMMUNITY_STORAGE_KEY, upgrades } from '../src/features/prototype/economy'
import { validPlacement, type MovableId } from '../src/features/prototype/community-placement'

for (const [width, height] of [[390, 844], [1280, 720]]) {
  test(`village history, local placement and collectibles at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.addInitScript(key => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ balance: 2000, owned: ['lanterns', 'picnic'], earnedChapters: [] })) }, COMMUNITY_STORAGE_KEY)
    await page.goto('/community')
    await expect(page.getByRole('button', { name: /museum/i })).toHaveCount(0)
    await expect(page.locator('.pt-museum-zone, .pt-museum-case')).toHaveCount(0)
    const bars = page.getByRole('group', { name: 'Select a day' }).getByRole('button')
    let previous: (string | null)[] = []
    for (let day = 0; day < 7; day++) {
      await bars.nth(day).click()
      const current = await page.locator('.pt-diorama [data-object]').evaluateAll(els => els.map(el => el.getAttribute('data-object')))
      expect(current).toEqual(expect.arrayContaining(previous))
      await expect(page.locator('[data-platform-shadow]')).toHaveAttribute('href', /community-village\.png/)
      if (day === 0) {
        expect(current).toEqual(['pebble'])
        await expect(page.locator('[data-terrain], [data-upgrade], [data-movable]')).toHaveCount(0)
      }
      await page.screenshot({ path: `/tmp/pebble-community-${width}-day-${day}.png` })
      previous = current
    }
    await expect(page.locator('[data-object^="tree-"][data-movable], [data-terrain][data-movable]')).toHaveCount(0)
    await page.getByRole('button', { name: 'Build your community', exact: true }).click()
    for (const name of ['Garnet', 'Sapphire', 'Emerald', 'Citrine']) {
      const article = page.getByRole('article', { name, exact: true })
      await expect(article).toContainText('300 Pebbles')
      await article.getByRole('button', { name: `Build ${name}`, exact: true }).click()
      await expect(article.getByRole('button', { name: `Owned ${name}` })).toBeDisabled()
    }
    await page.screenshot({ path: `/tmp/pebble-community-${width}-shop.png` })
    await page.keyboard.press('Escape')
    for (const id of ['garnet', 'sapphire', 'emerald', 'citrine', 'lanterns', 'picnic', 'pebble'] as MovableId[]) {
      const item = page.locator(`[data-object="${id}"]`)
      await expect(item).toHaveAttribute('data-movable', 'true')
      const before = await item.getAttribute('transform')
      const box = (await item.locator(':scope > rect').boundingBox())!
      if (width === 390) {
        const touch = await page.context().newCDPSession(page)
        const x = box.x + box.width / 2, y = box.y + box.height / 2
        await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
        await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 18, y: y - 12 }] })
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
        await touch.detach()
      } else {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.down()
        await page.mouse.move(box.x + box.width / 2 - 40, box.y + box.height / 2 + 24, { steps: 12 })
        await page.mouse.up()
      }
      await expect(item).not.toHaveAttribute('transform', before!)
      const positions = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).positions, COMMUNITY_STORAGE_KEY)
      expect(validPlacement(positions[id], id)).toBe(true)
    }
    const saved = await page.locator('[data-object="garnet"]').getAttribute('transform')
    await page.reload()
    await expect(page.locator('[data-object="garnet"]')).toHaveAttribute('transform', saved!)
    // Keyboard alternative and extreme outside drop both persist only land positions.
    await page.getByRole('button', { name: 'Move citrine', exact: true }).focus()
    await page.keyboard.press('ArrowLeft')
    const item = page.locator('[data-object="citrine"]'), box = (await item.locator(':scope > rect').boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(2, 2, { steps: 10 })
    await page.mouse.up()
    const positions = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).positions, COMMUNITY_STORAGE_KEY)
    expect(validPlacement(positions.citrine, 'citrine')).toBe(true)
    await page.screenshot({ path: `/tmp/pebble-community-${width}-arranged.png` })
    await bars.first().click()
    await expect(page.locator('[data-object]')).toHaveCount(1)
    expect(upgrades.filter(item => item.cost >= 300)).toHaveLength(4)
  })
}
