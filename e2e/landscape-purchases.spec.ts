import { expect, test } from '@playwright/test'
import { COMMUNITY_STORAGE_KEY, landscapeUpgrades } from '../src/features/prototype/economy'

for (const [width, height] of [[390, 844], [1280, 720]]) {
  test(`fixed landscape purchases, persistence and full refund at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.addInitScript(key => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ balance: 1000, owned: [], earnedChapters: [0] }))
    }, COMMUNITY_STORAGE_KEY)
    await page.goto('/community')
    const openBuild = () => page.getByRole('button', { name: 'Build your community', exact: true }).click()
    const shop = page.getByRole('dialog', { name: 'Build your community', exact: true })
    const reset = async () => {
      await shop.getByRole('button', { name: 'Reset purchases', exact: true }).click()
      await page.getByRole('alertdialog').getByRole('button', { name: 'Reset everything', exact: true }).click()
    }
    await openBuild()
    await reset()
    const emptyScene = await page.locator('.pt-community-world').screenshot()
    await openBuild()
    const section = shop.getByRole('region', { name: 'Landscape', exact: true })
    await section.evaluate(el => el.scrollIntoView({ block: 'start' }))
    await expect(section.getByRole('heading', { name: 'Landscape', exact: true })).toBeInViewport()
    await expect(section.getByRole('article')).toHaveCount(7)
    await page.screenshot({ path: `/tmp/pebble-landscape-${width}-shop.png` })
    for (const item of landscapeUpgrades) {
      const card = section.getByRole('article', { name: item.name, exact: true })
      await expect(card).toContainText(`${item.cost} Pebbles`)
      await expect(card.locator('image')).toHaveAttribute('href', /village-landscape/)
      await card.getByRole('button', { name: `Build ${item.name}`, exact: true }).click()
      await expect(card.getByRole('button', { name: `Owned ${item.name}`, exact: true })).toBeDisabled()
      await expect(page.locator(`[data-upgrade="${item.id}"]`)).toBeAttached()
    }
    await page.screenshot({ path: `/tmp/pebble-landscape-${width}-shop-owned.png` })
    await shop.getByRole('button', { name: 'Build Garden Bench', exact: true }).click()
    await expect(shop).toContainText('690 Pebbles available')
    await page.keyboard.press('Escape')
    await page.screenshot({ path: `/tmp/pebble-landscape-${width}-built.png` })
    await expect(page.locator('[data-landscape][data-movable]')).toHaveCount(0)
    // Try to drag actual river/tree pixels in the SVG coordinate system.
    for (const point of [{ x: 980, y: 540 }, { x: 800, y: 230 }]) {
      const screen = await page.locator('.pt-community-world > svg').evaluate((svg, p) => {
        const pos = new DOMPoint(p.x, p.y).matrixTransform((svg as SVGSVGElement).getScreenCTM()!)
        return { x: pos.x, y: pos.y }
      }, point)
      await page.mouse.move(screen.x, screen.y)
      await page.mouse.down()
      await page.mouse.move(screen.x + 30, screen.y + 20, { steps: 5 })
      await page.mouse.up()
    }
    const stored = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), COMMUNITY_STORAGE_KEY)
    expect((await stored()).positions).toEqual({})
    for (const id of ['pebble', 'bench']) {
      const item = page.locator(`[data-object="${id}"]`)
      await expect(item).toHaveAttribute('data-movable', 'true')
      const before = await item.getAttribute('transform')
      const rect = (await item.locator(':scope > rect').boundingBox())!
      await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2)
      await page.mouse.down()
      await page.mouse.move(rect.x + rect.width / 2 + 16, rect.y + rect.height / 2 - 10, { steps: 5 })
      await page.mouse.up()
      await expect(item).not.toHaveAttribute('transform', before!)
    }
    const saved = await stored()
    expect(Object.keys(saved.positions).sort()).toEqual(['bench', 'pebble'])
    await page.reload()
    await expect(page.locator('[data-upgrade]')).toHaveCount(8)
    await expect(page.locator('[data-object^="tree-"]')).toHaveCount(4)
    expect((await stored()).owned).toEqual(saved.owned)
    const days = page.getByRole('group', { name: 'Select a day' }).getByRole('button')
    await days.first().click()
    await expect(page.locator('[data-landscape], [data-upgrade], [data-terrain]')).toHaveCount(0)
    await expect(page.locator('[data-object]')).toHaveCount(1)
    await days.last().click()
    await openBuild()
    await shop.getByRole('button', { name: 'Reset purchases', exact: true }).click()
    await expect(page.getByRole('alertdialog')).toContainText('310 Pebbles will be returned.')
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.locator('[data-upgrade]')).toHaveCount(8)
    await reset()
    await expect(page.getByLabel('Pebble balance', { exact: true })).toContainText('1000')
    await expect(page.locator('[data-landscape], [data-upgrade], [data-terrain]')).toHaveCount(0)
    await expect(page.locator('[data-object]')).toHaveCount(1)
    expect(await page.locator('.pt-community-world').screenshot()).toEqual(emptyScene)
    expect(await stored()).toMatchObject({ owned: [], positions: {}, purchaseCosts: {}, freshStart: true, earnedChapters: [0] })
    await page.reload()
    await openBuild()
    for (const item of landscapeUpgrades) await expect(shop.getByRole('button', { name: `Build ${item.name}`, exact: true })).toBeEnabled()
    await shop.getByRole('button', { name: 'Build River', exact: true }).click()
    await expect(shop).toContainText('920 Pebbles available')
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-upgrade="river"]')).toBeVisible()
  })
}
