import { expect, test } from '@playwright/test'
import { mockMatchingApi, mockMatchingSession } from './matchmaking-fixture'

type Box = { x: number; y: number; width: number; height: number }
function overlaps(a: Box, b: Box) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}
for (const [width, height] of [[320, 480], [390, 844], [520, 844], [521, 844], [768, 1024], [1280, 720], [1920, 1080], [2560, 1440]]) {
  test(`Home thought composition at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockMatchingSession(page)
    await mockMatchingApi(page)
    await page.goto('/')
    const bubbles = page.locator('.pt-thought-bubble')
    await expect(bubbles).toHaveCount(width <= 520 ? 2 : 3)
    const mascot = (await page.locator('.pt-pebble-refresh').boundingBox())!
    const face = { x: mascot.x + mascot.width * .24, y: mascot.y + mascot.height * .42, width: mascot.width * .58, height: mascot.height * .36 }
    const boxes = await Promise.all((await bubbles.all()).map(bubble => bubble.boundingBox()))
    const toolbar = (await page.locator('.pt-focus-toolbar').boundingBox())!
    const action = (await page.getByRole('link', { name: 'Find people' }).boundingBox())!
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i]!
      expect(overlaps(box, face), 'bubble avoids face').toBe(false)
      expect(overlaps(box, toolbar), 'bubble avoids top controls').toBe(false)
      expect(overlaps(box, action), 'bubble avoids CTA').toBe(false)
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
      for (const other of boxes.slice(i + 1)) expect(overlaps(box, other!), 'bubbles do not collide').toBe(false)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    await expect(page.locator('.pt-home-focus a[href="/community"]')).toHaveCount(1)
    const community = (await page.getByRole('link', { name: 'Community', exact: true }).boundingBox())!
    const balance = (await page.getByLabel('Pebble balance', { exact: true }).boundingBox())!
    const dev = (await page.getByRole('button', { name: 'Developer controls' }).boundingBox())!
    expect(community.x).toBeLessThan(balance.x)
    expect(overlaps(community, dev)).toBe(false)
    const inbox = (await page.getByRole('button', { name: /Matching notifications/ }).boundingBox())!
    expect(overlaps(inbox, balance)).toBe(false)
    expect(overlaps(inbox, community)).toBe(false)
    expect(action.y + action.height).toBeLessThanOrEqual(height - (width <= 800 ? 72 : 0))
    await expect(page.locator('.pt-bottom-nav')).toBeVisible({ visible: width <= 800 })
    await page.screenshot({ path: `/tmp/pebble-home-review/${width}-home.png`, fullPage: true })
    await page.getByRole('link', { name: 'Find people' }).click()
    await expect(page).toHaveURL('/matchmaking')
  })
}

test('Pebble keyboard refresh waits, blocks duplicate refreshes and preserves focus', async ({ page }) => {
  await page.clock.install()
  await page.goto('/')
  // Freeze elapsed time between assertions; install alone keeps the clock running.
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000))
  const refresh = page.getByRole('button', { name: 'Refresh people who are available now' })
  const initial = await page.locator('.pt-thought-bubble').allTextContents()
  await refresh.focus()
  await page.keyboard.press('Enter')
  await expect(refresh).toBeDisabled()
  await expect(page.locator('.pt-available-preview')).toHaveClass(/is-thinking/)
  await expect(page.getByRole('button', { name: /^View .*profile$/ })).toHaveCount(0)
  await page.keyboard.press('Enter')
  await page.clock.fastForward(1749)
  await expect(refresh).toBeDisabled()
  await page.clock.fastForward(1)
  await expect(refresh).toBeEnabled()
  await expect(refresh).toBeFocused()
  const next = await page.locator('.pt-thought-bubble').allTextContents()
  expect(next.some(name => initial.includes(name))).toBe(false)
  await expect(page.getByRole('status')).toHaveText('People refreshed.')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await refresh.click()
  expect(await page.locator('.pt-pebble-refresh > svg').evaluate(el => getComputedStyle(el).animationName)).toBe('none')
  await page.clock.fastForward(1750)
  await expect(refresh).toBeEnabled()
})

test('bubbles use existing profile selection, refresh is local and cleans up on navigation', async ({ page }) => {
  const calls: string[] = []
  page.on('request', request => { if (request.url().includes('/api/matchmaking/')) calls.push(request.url()) })
  await page.goto('/')
  await page.getByRole('button', { name: "View Maya Brooks's profile" }).click()
  await expect(page).toHaveURL('/profile/person')
  await expect(page.getByRole('heading', { name: 'Maya Brooks' })).toBeVisible()
  await page.goto('/')
  await page.clock.install()
  await page.getByRole('button', { name: 'Refresh people who are available now' }).click()
  await page.getByRole('link', { name: 'Community', exact: true }).click()
  await page.clock.fastForward(2000)
  await expect(page.locator('.pt-diorama')).toBeVisible()
  await page.getByRole('link', { name: 'Back to Home' }).click()
  await expect(page.getByRole('button', { name: 'Refresh people who are available now' })).toBeEnabled()
  expect(calls).toEqual([])
})

test('bubble density updates on resize and empty preview keeps the actual matching action', async ({ page }) => {
  await page.goto('/')
  for (const width of [768, 520, 521, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(page.locator('.pt-thought-bubble')).toHaveCount(width <= 520 ? 2 : 3)
  }
  await page.getByRole('button', { name: 'Developer controls' }).click()
  await page.getByLabel('Empty states').check()
  await page.getByRole('button', { name: 'Developer controls' }).click()
  await expect(page.locator('.pt-thought-bubble')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Find people' })).toBeVisible()
})
