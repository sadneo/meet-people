import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  // The standard isolated suite enters mobile; this suite explicitly tests public web.
  await page.route('**/src/mobile/main.tsx*', route => route.fulfill({ contentType: 'application/javascript', body: 'import "/src/main.tsx"' }))
})

for (const width of [1440, 1024, 768, 481, 480, 479, 390, 320]) {
  test(`landing remains usable without horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Meet new friends,find a date,and make plans.')
    await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible()
    await expect(page.getByRole('group', { name: 'Try decorating the Garden preview' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    const hero = await page.locator('.landing-hero').boundingBox()
    const profile = await page.locator('.landing-profile').boundingBox()
    if (width > 760) expect(profile!.x).toBeGreaterThan(hero!.x + hero!.width / 2)
    await expect(page.locator('.landing-garden-art img')).toHaveJSProperty('naturalWidth', 1498)
    await expect.poll(() => page.locator('.landing-build-tray canvas').first().evaluate(canvas => {
      const context = (canvas as HTMLCanvasElement).getContext('2d')!
      return context.getImageData(0, 0, 40, 40).data.some((value, index) => index % 4 === 3 && value > 0)
    })).toBe(true)
  })
}

test('landing links are real, previews retain focus, and account storage is untouched', async ({ page }) => {
  const privateRequests: string[] = [], errors: string[] = []
  page.on('request', request => { if (/\/api\/(matchmaking|connections|conversations)|\/auth\/v1\//.test(request.url())) privateRequests.push(request.url()) })
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => localStorage.setItem('landing-account-storage-sentinel', 'preserve'))
  await page.goto('/#install')
  const before = await page.evaluate(() => JSON.stringify({ ...localStorage }))
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', 'https://mobile.dev.pebble.garden')
  const store = page.getByRole('link', { name: 'Open Google Play for Android' })
  await expect(store).toHaveAttribute('href', 'https://play.google.com/store/apps')
  await expect(store).toHaveAttribute('rel', 'noopener noreferrer')
  const dating = page.getByRole('button', { name: 'Dating', exact: true })
  await dating.focus()
  await page.keyboard.press('Enter')
  await expect(dating).toBeFocused()
  await expect(page.getByRole('heading', { name: 'Maya, 21' })).toBeVisible()
  await page.getByRole('button', { name: 'Add trees to Garden preview' }).click()
  const flowers = page.getByRole('button', { name: 'Add flowers to Garden preview' })
  await flowers.focus()
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'Remove flowers from Garden preview' })).toBeFocused()
  await expect(page.locator('.landing-placement')).toHaveCount(1)
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).toBe(before)
  await page.reload()
  await expect(page.locator('.landing-placement')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Alex, 22' })).toBeVisible()
  expect(privateRequests).toEqual([])
  expect(errors).toEqual([])
  await page.getByRole('link', { name: 'Privacy', exact: true }).click()
  await expect(page).toHaveURL(/\/privacy$/)
  await expect(page.locator('.web-landing')).toHaveCount(0)
})

test('landing preview motion respects reduced-motion preferences', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Dating', exact: true }).click()
  await page.getByRole('button', { name: 'Add pebbles to Garden preview' }).click()
  expect(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length)).toBe(0)
})
