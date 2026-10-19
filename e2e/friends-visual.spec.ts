import { expect, test } from '@playwright/test'
import { browserAccount, browserProfile, mockMatchingApi, mockMatchingSession } from './matchmaking-fixture'

const evidence = 'worktree/friends-light-review/existing-visual'
const sizes = [{ width: 320, height: 568 }, { width: 375, height: 812 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 800, height: 900 }, { width: 1440, height: 900 }]
for (const size of [{ width: 390, height: 844 }, { width: 800, height: 900 }, { width: 1440, height: 900 }, { width: 320, height: 568 }, { width: 390, height: 420 }]) test(`Friends setup reference scale ${size.width}x${size.height}`, async ({ page }) => {
  await page.setViewportSize(size)
  const external: string[] = [], mutations: string[] = []
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin !== 'http://127.0.0.1:3194') {
      external.push(route.request().url()); return route.abort()
    }
    return route.continue()
  })
  page.on('request', request => {
    if (request.url().includes('/api/') && request.method() !== 'GET') mutations.push(request.method())
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockMatchingSession(page); await mockMatchingApi(page)
  await page.goto('/matchmaking')
  await expect(page.getByRole('button', { name: 'Find Friends', exact: true })).toBeEnabled()
  await expect(page.getByRole('navigation', { name: 'Matching views' }).getByRole('link', { name: 'Friends', exact: true })).toHaveCSS('flex-direction', 'row')
  const scene = page.locator('.friends-setup .friends-scene')
  for (const image of await scene.locator('img').all()) await image.evaluate(element => (element as HTMLImageElement).decode())
  const hero = (await scene.boundingBox())!, mascot = (await scene.locator('.friends-mascot').boundingBox())!
  await expect(scene.locator('.friends-mascot')).toHaveCSS('clip-path', 'inset(1.5%)')
  const companions = await scene.locator('.friends-companion').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().width))
  console.log(`Friends setup scale ${size.width}x${size.height}: ${JSON.stringify({ scene: hero.height, mascot: { width: mascot.width, height: mascot.height }, companions })}`)
  if (size.height > 650) {
    expect(hero.height).toBeGreaterThanOrEqual(260)
    expect(hero.height).toBeLessThanOrEqual(280)
    expect(mascot.width).toBeGreaterThanOrEqual(size.width === 390 ? 270 : 320)
    expect(mascot.height).toBeGreaterThanOrEqual(size.width === 390 ? 175 : 210)
    expect(companions[0]).toBeGreaterThanOrEqual(54)
    expect(companions[1]).toBeGreaterThanOrEqual(46)
    expect(companions[2]).toBeGreaterThanOrEqual(36)
  } else {
    expect(hero.height).toBeGreaterThanOrEqual(180)
    expect(hero.height).toBeLessThanOrEqual(220)
    const table = page.getByRole('table', { name: 'Weekly availability' })
    await table.evaluate(element => element.scrollIntoView({ block: 'center' }))
    const grid = (await table.boundingBox())!, navbar = (await page.locator('.pt-bottom-nav').boundingBox())!
    expect(grid.y).toBeGreaterThanOrEqual(0)
    expect(grid.y + grid.height).toBeLessThanOrEqual(navbar.y)
    await page.screenshot({ path: `${evidence}/availability-${size.width}x${size.height}.png` })
  }
  expect(mascot.y - hero.y).toBeGreaterThan(12)
  expect(hero.y + hero.height - mascot.y - mascot.height).toBeGreaterThan(12)
  expect(external).toEqual([])
  expect(mutations).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(size.width)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: `${evidence}/setup-${size.width}x${size.height}.png`, animations: 'disabled' })
  await page.screenshot({ path: `${evidence}/setup-full-${size.width}x${size.height}.png`, fullPage: true, animations: 'disabled' })
})
for (const size of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) test(`Friends clean mascot reference reconciliation ${size.width}`, async ({ page }) => {
  await page.setViewportSize(size)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockMatchingSession(page); await mockMatchingApi(page)
  await page.goto('/matchmaking')
  await expect(page.getByRole('button', { name: 'Find Friends', exact: true })).toBeEnabled()
  const mascot = page.locator('.friends-mascot')
  await mascot.evaluate(element => (element as HTMLImageElement).decode())
  await expect(mascot).toHaveCSS('clip-path', 'inset(1.5%)')
  await expect(page.locator('.friends-orbit')).toHaveCount(0)
  await expect(page.locator('.friends-companion img')).toHaveCount(3)
  for (const image of await page.locator('.friends-companion img').all()) await image.evaluate(element => (element as HTMLImageElement).decode())
  await expect(page.locator('.friends-twinkle')).toHaveCount(1)
  await expect(page.locator('.friends-reward')).toHaveText('A little time. New connections.')
  await expect(mascot).toHaveCSS('image-rendering', 'pixelated')
  await expect(mascot).toHaveCSS('animation-name', 'none')
  await page.screenshot({ path: `${evidence}/setup-${size.width}.png`, fullPage: true })
  await page.locator('.friends-scene').screenshot({ path: `${evidence}/scene-${size.width}.png` })
})
for (const size of sizes) test(`Friends visual states ${size.width}x${size.height}`, async ({ page }) => {
  await page.setViewportSize(size)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const external: string[] = [], mutations: string[] = []
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin !== 'http://127.0.0.1:3194') { external.push(route.request().url()); return route.abort() }
    return route.continue()
  })
  await mockMatchingSession(page); await mockMatchingApi(page)
  // Synthetic persisted profile only; actual single-candidate response contract.
  const profile = { ...browserProfile, availability: [{ dow: 1, start_time: '09:15:00', end_time: '11:45:00' }, ...browserProfile.availability] }
  await page.route('**/api/matchmaking/profile', route => route.fulfill({ json: { profile } }))
  let candidate = false
  await page.route('**/api/matchmaking/result', route => route.fulfill({ json: { candidate: candidate ? { id: 'a0000000-0000-4000-8000-000000000002', name: 'Taylor', avatar: null, interests: ['Coffee'], overlap: 'some', mode: 'active', meetup: null } : null } }))
  page.on('request', request => { if (request.url().includes('/api/') && request.method() !== 'GET') mutations.push(request.method()) })
  await page.goto('/matchmaking?source=friends-review')
  const start = page.getByRole('button', { name: 'Find Friends', exact: true })
  await expect(start).toBeEnabled()
  const navbar = page.locator(size.width <= 800 ? '.pt-bottom-nav' : '.pt-app-header')
  const navbarBefore = await navbar.evaluate(element => ({ html: element.outerHTML, background: getComputedStyle(element).backgroundColor, position: getComputedStyle(element).position, height: element.getBoundingClientRect().height }))
  await expect(page.getByRole('navigation', { name: 'Primary navigation', exact: true }).filter({ visible: true })).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(size.width)
  const bounds = await page.locator('.friends-page').boundingBox()
  expect(bounds!.x).toBeCloseTo(0, 0); expect(bounds!.width).toBe(size.width)
  expect(await page.locator('.friends-page').evaluate(element => getComputedStyle(element).borderRadius)).toBe('0px')
  const table = page.getByRole('table', { name: 'Weekly availability', exact: true })
  await expect(table.getByRole('button')).toHaveCount(28)
  await expect(table.getByRole('button', { name: 'Monday morning, partially available' })).toHaveAttribute('aria-pressed', 'mixed')
  await table.evaluate(element => element.scrollIntoView({ block: 'center' }))
  const grid = await table.boundingBox()
  expect(grid!.height).toBeLessThan(size.height - 100)
  for (const block of await table.getByRole('button').all()) {
    await expect(block).toBeInViewport()
    const target = (await block.boundingBox())!
    expect(target.width).toBeGreaterThanOrEqual(44)
    expect(target.height).toBeGreaterThanOrEqual(44)
    expect(await block.evaluate(element => { const r = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) }), 'all blocks clear the real navigation together').toBe(true)
  }
  expect(await table.evaluate(element => element.parentElement!.scrollWidth <= element.parentElement!.clientWidth)).toBe(true)
  const keyboardBlock = table.getByRole('button', { name: 'Tuesday afternoon, not available', exact: true })
  await keyboardBlock.focus(); await page.keyboard.press('Space')
  await expect(table.getByRole('button', { name: 'Tuesday afternoon, available', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Enter')
  await expect(keyboardBlock).toHaveAttribute('aria-pressed', 'false')
  await page.screenshot({ path: `${evidence}/availability-${size.width}.png`, animations: 'disabled' })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: `${evidence}/setup-${size.width}.png`, fullPage: true })
  await page.getByRole('button', { name: 'Preferences', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Your kind of connection.', exact: true })).toBeVisible()
  const preferencesDialog = page.getByRole('dialog', { name: 'Your kind of connection.', exact: true })
  await expect(preferencesDialog.getByRole('slider')).toHaveCount(3)
  await expect(preferencesDialog.getByRole('button', { name: 'Apply filter preview', exact: true })).toBeEnabled()
  await page.screenshot({ path: `${evidence}/preferences-${size.width}.png`, animations: 'disabled' })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Preferences', exact: true })).toBeFocused()
  await start.scrollIntoViewIfNeeded()
  expect(await start.evaluate(element => { const rect = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)) })).toBe(true)
  await start.click()
  await expect(page.getByRole('button', { name: 'Check for a match', exact: true })).toBeEnabled()
  await page.evaluate(() => window.scrollTo(0, 0))
  if (size.width <= 800) {
    const navigation = (await page.locator('.pt-bottom-nav').boundingBox())!
    for (const action of ['Check for a match', 'Cancel search']) {
      const target = (await page.getByRole('button', { name: action, exact: true }).boundingBox())!
      expect(target.y + target.height, `${action} clears navigation on initial queue view`).toBeLessThanOrEqual(navigation.y)
    }
  }
  await page.screenshot({ path: `${evidence}/queue-${size.width}.png`, fullPage: true })
  await page.getByRole('button', { name: 'Check for a match', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('No candidate yet')
  await page.screenshot({ path: `${evidence}/no-candidate-${size.width}.png`, fullPage: true })
  candidate = true
  await page.getByRole('button', { name: 'Check for a match', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Taylor', exact: true })).toBeVisible()
  await expect(page.getByText('Suggested match', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /ready|chat/i })).toHaveCount(0)
  await page.screenshot({ path: `${evidence}/candidate-${size.width}.png`, fullPage: true })
  await page.getByRole('button', { name: 'Cancel search', exact: true }).click()
  await expect(start).toBeEnabled()
  expect(mutations).toEqual(['POST', 'DELETE'])
  await page.getByRole('link', { name: 'Dating', exact: true }).click()
  await expect(page.locator('.dating-view')).toBeVisible()
  await expect.poll(() => page.locator('.dating-portrait').first().evaluate(element => (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0)).toBe(true)
  await page.locator('.dating-portrait').first().evaluate(async element => {
    await (element as HTMLImageElement).decode()
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  })
  await expect(page.locator('.friends-page')).toHaveCount(0)
  expect(await navbar.evaluate(element => ({ html: element.outerHTML, background: getComputedStyle(element).backgroundColor, position: getComputedStyle(element).position, height: element.getBoundingClientRect().height }))).toEqual(navbarBefore)
  await page.screenshot({ path: `${evidence}/dating-${size.width}.png`, fullPage: true })
  await page.goBack(); await expect(start).toBeEnabled()
  await page.goForward(); await expect(page.locator('.dating-view')).toBeVisible()
  await page.reload(); await expect(page.locator('.dating-view')).toBeVisible()
  await page.route('**/api/matchmaking/profile', route => route.fulfill({ status: 503, json: { code: 'unavailable', error: 'Profile preferences unavailable.' } }))
  await page.goto('/matchmaking')
  await expect(page.getByRole('alert')).toContainText('Profile preferences unavailable.')
  await expect(page.getByRole('button', { name: 'Retry profile' })).toBeVisible()
  await expect(start).toBeDisabled()
  await page.screenshot({ path: `${evidence}/profile-failure-${size.width}.png`, fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(size.width)
  expect(external).toEqual([])
})

test('Friends exact local assets, motion bounds and reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockMatchingSession(page); await mockMatchingApi(page)
  await page.goto('/matchmaking')
  await expect(page.getByRole('button', { name: 'Find Friends', exact: true })).toBeEnabled()
  const images = page.locator('.friends-scene img')
  expect(await page.locator('.friends-mascot').evaluate(async element => {
    const bytes = await (await fetch((element as HTMLImageElement).src)).arrayBuffer()
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(value => value.toString(16).padStart(2, '0')).join('')
  })).toBe('3ce126d3fd5739874c16fa226e0a9a14aa31a373e87ee30a2964b2838b3a0396')
  expect(await page.locator('.friends-companion img').first().evaluate(async element => {
    const bytes = await (await fetch((element as HTMLImageElement).src)).arrayBuffer()
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(value => value.toString(16).padStart(2, '0')).join('')
  })).toBe('6da57823e43b3bd3da539b084a76b0d265735573fcba5ab94f4246ca1cb9bed6')
  await expect(images).toHaveCount(4)
  for (const image of await images.all()) expect.soft(await image.evaluate(element => (element as HTMLImageElement).naturalWidth), 'local sprite must load').toBeGreaterThan(0)
  const mascot = page.locator('.friends-mascot')
  await expect(mascot).toHaveCSS('image-rendering', 'pixelated')
  for (const time of [0, 1500, 3000, 4500, 5999]) {
    expect(await mascot.evaluate((element, time) => {
      for (const animation of element.getAnimations()) { animation.pause(); animation.currentTime = time }
      const art = element.getBoundingClientRect(), scene = element.parentElement!.getBoundingClientRect()
      return art.top >= scene.top && art.bottom <= scene.bottom && art.left >= scene.left && art.right <= scene.right
    }, time)).toBe(true)
  }
  for (const companion of await page.locator('.friends-companion').all()) {
    for (const fraction of [0, .35, .7, .999]) {
      expect(await companion.evaluate((element, fraction) => {
        for (const animation of element.getAnimations()) { animation.pause(); animation.currentTime = Number(animation.effect?.getTiming().duration) * fraction }
        const art = element.getBoundingClientRect(), scene = element.parentElement!.getBoundingClientRect()
        return art.top >= scene.top && art.bottom <= scene.bottom && art.left >= scene.left && art.right <= scene.right
      }, fraction)).toBe(true)
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(mascot).toHaveCSS('animation-name', 'none')
  for (const companion of await page.locator('.friends-companion').all()) await expect(companion).toHaveCSS('animation-name', 'none')
  await page.screenshot({ path: `${evidence}/reduced-motion-390.png`, fullPage: true })
})

test('Friends short-height grid stays wholly reachable above the real navbar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 420 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockMatchingSession(page); await mockMatchingApi(page)
  await page.goto('/matchmaking')
  await expect(page.getByRole('button', { name: 'Find Friends', exact: true })).toBeEnabled()
  const table = page.getByRole('table', { name: 'Weekly availability' })
  await table.evaluate(element => element.scrollIntoView({ block: 'center' }))
  const nav = (await page.locator('.pt-bottom-nav').boundingBox())!
  const grid = (await table.boundingBox())!
  expect(grid.y).toBeGreaterThanOrEqual(0)
  expect(grid.y + grid.height).toBeLessThanOrEqual(nav.y)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.screenshot({ path: `${evidence}/short-390x420.png`, animations: 'disabled' })
})

test('Friends changed draft persists via the shared server path before one queue join', async ({ page }) => {
  await mockMatchingSession(page); await mockMatchingApi(page)
  let persisted = browserProfile
  const writes: string[] = []
  await page.route('**/api/matchmaking/profile', route => {
    if (route.request().method() === 'PUT') { persisted = route.request().postDataJSON(); writes.push('profile') }
    return route.fulfill({ json: { profile: persisted } })
  })
  await page.route('**/api/matchmaking/account', route => route.fulfill({ json: browserAccount(persisted) }))
  page.on('request', request => { if (request.url().endsWith('/queue') && request.method() === 'POST') writes.push('join') })
  await page.goto('/matchmaking')
  await expect(page.getByRole('button', { name: 'Find Friends', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Add yours' }).click()
  await page.getByLabel('Add a matching interest').fill('  Board   games  ')
  await page.getByRole('button', { name: 'Add interest', exact: true }).click()
  await page.getByRole('button', { name: 'Find Friends', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Cancel search' })).toBeEnabled()
  expect(writes).toEqual(['profile', 'join'])
  expect(persisted.interests).toContain('Board   games')
  await page.goto('/profile')
  await expect(page.getByRole('group', { name: 'Usual interests' }).getByRole('button', { name: /Board\s+games/, exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => localStorage.getItem('pebble.shared-preferences.v1'))).toBeNull()
})
