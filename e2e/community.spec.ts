import { expect, test, type Page } from '@playwright/test'

async function enterCommunity(page: Page) {
  await page.getByRole('button', { name: 'Open Pebble pouch' }).click()
  await expect(page.getByRole('heading', { name: 'Good things grow together.' })).toBeVisible()
}

async function openActivity(page: Page, title: string) {
  await page.getByRole('button', { name: 'Activities', exact: true }).click()
  const activity = page.getByRole('article').filter({ has: page.getByRole('heading', { name: title }) })
  await activity.getByRole('button').click()
  await expect(page.getByRole('dialog')).toBeVisible()
}

test('the verified mock reward loop grows, customizes, and resets on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/community')
  await enterCommunity(page)
  await expect(page.getByRole('img', { name: 'A single smiling pebble in a sunlit meadow' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sage roof' })).toBeDisabled()

  for (const [index, title] of ['A little walk, a new friend', 'Good company, great coffee', 'Grow something together'].entries()) {
    await openActivity(page, title)
    await expect(page.getByRole('button', { name: 'No Pebbles ready yet' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Simulate 1 confirmation' })).toBeDisabled()
    await page.getByRole('button', { name: 'Add demo proof' }).click()
    await expect(page.getByText('Demo proof submitted', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Simulate remaining confirmations' }).click()
    await page.getByRole('button', { name: /Bring \d+ Pebbles home/ }).click()
    await expect(page.getByRole('heading', { name: 'Good things grow together.' })).toBeInViewport()
    await page.getByRole('button', { name: /Grow your world/ }).click()
    await expect(page.getByText(`STAGE ${index + 2} OF 4`, { exact: true })).toBeVisible()
    await expect(page.getByLabel('0 Pebbles available')).toBeVisible()
    if (index === 1) {
      await page.getByRole('button', { name: 'Dusty blue roof' }).click()
      await expect(page.getByRole('button', { name: 'Dusty blue roof' })).toHaveAttribute('aria-pressed', 'true')
      await page.getByRole('button', { name: 'Wildflowers' }).click()
      await expect(page.getByRole('button', { name: 'Wildflowers' })).toHaveAttribute('aria-pressed', 'false')
    }
  }
  await openActivity(page, 'A little walk, a new friend')
  await expect(page.getByRole('button', { name: 'All rewards collected' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Simulate 1 confirmation' })).toBeDisabled()
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await page.getByRole('button', { name: 'Community', exact: true }).click()
  await page.getByRole('button', { name: 'Reset demo', exact: true }).click()
  await page.getByRole('button', { name: 'Keep my little world' }).click()
  await expect(page.getByText('STAGE 4 OF 4', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Reset demo', exact: true }).click()
  await page.getByRole('button', { name: 'Reset & start fresh' }).click()
  await expect(page.getByText('STAGE 1 OF 4', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Activities', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Join in', exact: true })).toHaveCount(3)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Open Pebble pouch' })).toBeVisible()
  await enterCommunity(page)
  await expect(page.getByLabel('0 Pebbles available')).toBeVisible()
})

test('proof, partial collection, and confirmations survive closing the activity', async ({ page }) => {
  await page.goto('/community')
  await enterCommunity(page)
  await openActivity(page, 'A little walk, a new friend')
  await page.getByRole('button', { name: 'Add demo proof' }).click()
  await page.getByRole('button', { name: 'Bring 10 Pebbles home' }).click()
  await expect(page.getByLabel('10 Pebbles available')).toBeVisible()
  await openActivity(page, 'A little walk, a new friend')
  await expect(page.getByRole('button', { name: 'No Pebbles ready yet' })).toBeDisabled()
  await page.getByRole('button', { name: 'Simulate 1 confirmation' }).click()
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByText('1 / 3 confirmed', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Bring 10 Pebbles home' }).click()
  await expect(page.getByLabel('20 Pebbles available')).toBeVisible()
})

test('intro supports keyboard, scatters all expressions, and leaves no hidden focus layer', async ({ page }) => {
  await page.goto('/community')
  const intro = page.getByRole('button', { name: 'Open Pebble pouch' })
  await intro.focus()
  await page.keyboard.press('Enter')
  for (const expression of ['happy', 'sad', 'angry', 'surprised', 'neutral']) {
    await expect(page.locator(`[data-expression="${expression}"]`).first()).toBeVisible()
  }
  await expect(intro).toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByRole('heading', { name: 'Good things grow together.' })).toBeFocused()
  await expect(intro).toHaveCount(0)
})

test('reduced motion retains the intro, reward flow, and static world', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/community')
  expect(await page.locator('.pebble-pouch').evaluate(el => getComputedStyle(el).animationName)).toBe('none')
  await enterCommunity(page)
  expect(await page.locator('.pebble-stone-bob').evaluate(el => getComputedStyle(el).animationName)).toBe('none')
  await openActivity(page, 'A little walk, a new friend')
  await page.getByRole('button', { name: 'Add demo proof' }).click()
  await page.getByRole('button', { name: 'Bring 10 Pebbles home' }).click()
  await expect(page.getByLabel('10 Pebbles available')).toBeVisible()
  await expect(page.locator('.pebble-balance-feedback')).toHaveCount(0, { timeout: 4000 })
})

test('intro, world, and reward dialog fit narrow and wide screens without changing Home', async ({ page }) => {
  await page.goto('/community')
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  }
  await enterCommunity(page)
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 })
    await openActivity(page, 'Grow something together')
    const dialog = page.getByRole('dialog')
    const bounds = await dialog.boundingBox()
    expect(bounds!.width).toBeLessThanOrEqual(width)
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    await page.getByRole('button', { name: 'Community', exact: true }).click()
  }
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Meet People' })).toBeVisible()
  expect(await page.locator('body').evaluate(body => getComputedStyle(body).display)).toBe('grid')
})
