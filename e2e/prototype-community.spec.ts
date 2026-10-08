import { mockCurrentEvents, testEventId } from './current-events-fixture'
import { expect, test } from '@playwright/test'
import { COMMUNITY_STORAGE_KEY, upgrades } from '../src/features/prototype/economy'

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }, { width: 3840, height: 2160 }]) {
  test(`community fills viewport and persists manual purchases at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await expect(page.locator('.pt-community-world')).toBeVisible()
    const box = (await page.locator('.pt-community-home').boundingBox())!
    expect(box.x).toBe(0)
    expect(box.width).toBe(viewport.width)
    expect(Math.round(box.y + box.height)).toBe(viewport.height)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width)
    await expect(page.locator('.pt-demo-strip, .pt-home-agenda, .pt-home-recommended')).toHaveCount(0)
    await page.getByRole('button', { name: 'Build your community', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Build Wildflower Patch', exact: true })).toBeDisabled()
    for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Add 100 demo Pebbles', exact: true }).click()
    for (const upgrade of upgrades) {
      await page.getByRole('button', { name: `Build ${upgrade.name}`, exact: true }).click()
      await expect(page.getByRole('button', { name: `Owned ${upgrade.name}`, exact: true })).toBeDisabled()
      await expect(page.locator(`[data-upgrade="${upgrade.id}"]`)).toBeAttached()
    }
    await expect(page.getByLabel('Pebble balance', { exact: true })).toContainText('25')
    await page.keyboard.press('Escape')
    await expect(page.locator('.pt-upgrade-drawer')).toBeHidden()
    await page.getByRole('link', { name: 'Events', exact: true }).click()
    await page.getByRole('link', { name: 'Home', exact: true }).click()
    await page.reload()
    await expect(page.locator('[data-upgrade]')).toHaveCount(10)
    await expect(page.getByLabel('Pebble balance', { exact: true })).toContainText('25')
    await page.getByRole('button', { name: 'Say hello to your Pebble', exact: true }).click()
    await expect(page.locator('.pt-character-heart')).toBeVisible()
    await page.getByRole('button', { name: 'Reset community/upgrades', exact: true }).click()
    await expect(page.locator('[data-upgrade]')).toHaveCount(0)
    await expect(page.getByLabel('Pebble balance', { exact: true })).toContainText('0')
    await page.reload()
    await expect(page.locator('[data-upgrade]')).toHaveCount(0)
  })
}

test('Intro can be replayed, reset during opening, and returns to Home', async ({ page }) => {
  await page.goto('/intro')
  await expect(page.getByRole('button', { name: 'Open Pebble pouch' })).toHaveClass(/idle/)
  await page.getByRole('button', { name: 'Open Pebble pouch' }).click()
  await expect(page.locator('.pebble-scattered-stone')).toHaveCount(9)
  await page.getByRole('button', { name: 'Replay Intro', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Open Pebble pouch' })).toHaveClass(/idle/)
  await expect(page.locator('.pebble-scattered-stone')).toHaveCount(0)
  await page.getByRole('button', { name: 'Open Pebble pouch' }).click()
  await expect(page.locator('.pt-community-world')).toBeVisible()
  await page.getByLabel('Review scene').selectOption('Intro')
  await expect(page.getByRole('button', { name: 'Open Pebble pouch' })).toHaveClass(/idle/)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: 'Open Pebble pouch' }).click()
  await expect(page.locator('.pt-community-world')).toBeVisible()
  await expect(page.getByLabel('Pebble balance', { exact: true })).toContainText('0')
})

test('curious Pebble visits actual viewport edges and retreats fully at 4K', async ({ page }) => {
  await page.setViewportSize({ width: 3840, height: 2160 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => { Math.random = () => 0 })
  await page.clock.install()
  await page.goto('/login')
  const mascot = page.getByRole('button', { name: 'Say hello to the curious Pebble' })
  for (let edge = 0; edge < 4; edge++) {
    await expect(mascot).toHaveClass(new RegExp(`pt-edge-${edge}`))
    const box = (await mascot.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(140)
    if (edge === 0) expect(box.y + box.height).toBeGreaterThan(2160)
    if (edge === 1) expect(box.x).toBeLessThan(0)
    if (edge === 2) expect(box.x + box.width).toBeGreaterThan(3840)
    if (edge === 3) expect(box.y).toBeLessThan(0)
    await mascot.click()
    const hidden = (await mascot.boundingBox())!
    expect(hidden.x + hidden.width < 0 || hidden.x > 3840 || hidden.y + hidden.height < 0 || hidden.y > 2160).toBe(true)
    await page.clock.fastForward(1500)
  }
})

test('invalid local economy data does not break the prototype', async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, '{broken'), COMMUNITY_STORAGE_KEY)
  await page.goto('/')
  await expect(page.getByLabel('Pebble balance', { exact: true })).toContainText('0')
  await page.getByRole('button', { name: 'Add 100 demo Pebbles', exact: true }).click()
  await expect(page.getByLabel('Pebble balance', { exact: true })).toContainText('100')
})

test('wide event selection opens details and utility scenes remain responsive', async ({ page }) => {
  await page.setViewportSize({ width: 3840, height: 2160 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockCurrentEvents(page)
  await page.goto('/events')
  await page.getByRole('link', { name: 'See event & people' }).click()
  await expect(page).toHaveURL(new RegExp(`selected=${testEventId}`))
  await expect(page.locator('.ev-event-preview').getByRole('heading', { name: 'Campus concert', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Outdoors', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'A quiet calendar' })).toBeVisible()
  for (const scene of ['Free Time', 'Free Time Match', 'Messages', 'Profile', 'Register']) {
    await page.getByLabel('Review scene').selectOption(scene)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), scene).toBe(true)
  }
  await page.getByLabel('Review scene').selectOption('Messages')
  await expect(page.locator('.pt-conversation-pane')).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.pt-conversation-pane')).toBeHidden()
  await page.getByLabel('Review scene').selectOption('Events')
  await expect(page.locator('.ev-event-preview')).toBeHidden()
})
