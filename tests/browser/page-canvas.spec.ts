import { expect, test, type Locator, type Page } from '@playwright/test'
import { emptyAccount } from '../../shared/account'
import { mockMatchingApi, mockMatchingSession } from './matchmaking-fixture'
import { mockMessagingApi } from './messaging-fixture'

const white = 'rgb(255, 255, 255)'

// Check the painted canvas, not whether an intentionally transparent wrapper has
// its own fill. Cards, artwork, dialogs and navigation are separate surfaces.
async function canvasColor(locator: Locator) {
  return locator.evaluate(element => {
    for (let current: Element | null = element; current; current = current.parentElement) {
      const style = getComputedStyle(current)
      if (style.backgroundImage !== 'none') return style.backgroundImage
      if (style.backgroundColor !== 'rgba(0, 0, 0, 0)') return style.backgroundColor
    }
    return 'unpainted'
  })
}

async function whiteCanvas(page: Page, selector: string) {
  await expect.poll(() => canvasColor(page.locator(selector))).toBe(white)
  await expect.poll(() => canvasColor(page.locator('body'))).toBe(white)
  await expect(page.locator('html')).toHaveCSS('background-color', white)
}

async function whiteNavigation(page: Page, width: number, activeName?: string) {
  const chrome = page.locator(width <= 800 ? '.pt-bottom-nav' : '.pt-app-header')
  await expect(chrome).toBeVisible()
  await expect(chrome).toHaveCSS('background-color', white)
  await expect(chrome).toHaveCSS('background-image', 'none')
  if (!activeName) return
  const navigation = width <= 800 ? chrome : chrome.locator('.pt-desktop-nav')
  const active = navigation.getByRole('link', { name: activeName, exact: true })
  await expect(active).toHaveAttribute('aria-current', 'page')
  await expect(active).toHaveCSS('background-color', 'rgb(234, 245, 217)')
  await expect(active).toHaveCSS('color', 'rgb(31, 90, 60)')
  expect(await active.evaluate(element => {
    const dot = getComputedStyle(element, '::after')
    return { width: dot.width, height: dot.height, color: dot.backgroundColor }
  })).toEqual({ width: '4px', height: '4px', color: 'rgb(31, 90, 60)' })
  for (const link of await navigation.getByRole('link').all()) {
    const box = (await link.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
  }
  const inactive = navigation.getByRole('link', { name: 'Events', exact: true })
  await expect(inactive).toHaveCSS('color', 'rgb(66, 91, 73)')
  await active.focus()
  await expect(active).toBeFocused()
  await expect(active).toHaveCSS('outline-style', 'solid')
  await expect(active).toHaveCSS('outline-color', 'rgb(49, 95, 155)')
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin !== 'http://127.0.0.1:3194') return route.abort()
    if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 503, json: { code: 'unavailable', error: 'Isolated canvas test boundary.' } })
    return route.continue()
  })
})

for (const width of [390, 1440]) {
  test(`signed-out auth/public canvases are white at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await mockMatchingSession(page, false)
    const colors: Record<string, string> = {}
    for (const path of ['/login', '/register', '/auth/forgot-password', '/auth/callback', '/welcome', '/terms', '/privacy', '/cookies']) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await whiteCanvas(page, 'main')
      colors[path] = await canvasColor(page.locator('main'))
      await expect(page.locator('.friends-page')).toHaveCount(0)
      await page.screenshot({ path: testInfo.outputPath(`${path.replaceAll('/', '-')}.png`), fullPage: true })
    }
    await testInfo.attach('computed-canvases', { body: JSON.stringify(colors, null, 2), contentType: 'application/json' })
  })

  test(`signed-in product/supporting canvases are white at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await mockMatchingSession(page)
    await mockMatchingApi(page)
    await mockMessagingApi(page)
    await page.route('**/api/events?*', route => route.fulfill({ status: 503, json: { error: 'Events unavailable in isolated canvas coverage.' } }))
    const colors: Record<string, string> = {}
    for (const path of ['/', '/profile', '/settings', '/events', '/messages', '/free-time', '/community', '/downtime-matchmaking', '/intro', '/profile/person']) {
      await page.goto(path)
      await expect(page.locator('.pt-app')).toBeVisible()
      await whiteCanvas(page, '.pt-app')
      await whiteCanvas(page, '.pt-main')
      colors[path] = await canvasColor(page.locator('.pt-main'))
      if (path === '/profile') {
        await expect(page.locator('.account-identity')).toHaveCSS('background-color', 'rgb(255, 254, 248)')
        await expect(page.locator('.account-profile-page')).toBeVisible()
      }
      if (path === '/events') await whiteCanvas(page, '.ev-feature')
      if (path === '/intro') await whiteCanvas(page, '.pebble-pouch-intro')
      if (path !== '/intro') await whiteNavigation(page, width, path === '/' ? 'Home' : undefined)
      await page.screenshot({ path: testInfo.outputPath(`private-${path.replaceAll('/', '-') || 'home'}.png`), fullPage: true })
    }
    // The separate authenticated experiment has its own full-page CSS.
    await page.goto('/prototype/yzcommunity')
    await expect(page.locator('.pebble-app')).toBeVisible()
    await whiteCanvas(page, '.pebble-app')
    // The protected not-found page intentionally has no product shell.
    await page.goto('/missing')
    await expect(page.getByRole('heading', { name: 'Page not found', exact: true })).toBeVisible()
    await whiteCanvas(page, 'main')
    colors['/missing'] = await canvasColor(page.locator('main'))
    await testInfo.attach('computed-canvases', { body: JSON.stringify(colors, null, 2), contentType: 'application/json' })
  })

  test(`onboarding canvas is white while its card stays off-white at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await mockMatchingSession(page)
    await page.route('**/api/matchmaking/account', route => route.fulfill({ json: emptyAccount }))
    await page.goto('/profile')
    await expect(page.getByRole('heading', { name: 'Complete onboarding', exact: true })).toBeVisible()
    await whiteCanvas(page, '.pt-access-root')
    await expect(page.locator('.pt-access-card')).toHaveCSS('background-color', 'rgb(255, 254, 249)')
    await expect(page.locator('.pt-app')).toHaveCount(0)
  })

  test(`Friends uses its light palette and Dating stays white at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await mockMatchingSession(page)
    await mockMatchingApi(page)
    const writes: string[] = []
    page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/') && request.method() !== 'GET') writes.push(request.url()) })
    await page.goto('/matchmaking')
    await expect(page.getByRole('button', { name: 'Find Friends', exact: true })).toBeEnabled()
    const friends = page.locator('.friends-page')
    const appearance = () => friends.evaluate(element => {
      const style = getComputedStyle(element)
      const scene = getComputedStyle(element.querySelector('.friends-scene')!)
      return { background: style.backgroundImage, canvas: style.backgroundColor, color: style.color, scene: scene.backgroundColor }
    })
    const original = await appearance()
    expect(original.background).toBe('none')
    expect(original.canvas).toBe('rgb(250, 251, 247)')
    expect(original.color).toBe('rgb(89, 109, 80)')
    expect(original.scene).toBe('rgb(223, 203, 189)')
    await whiteNavigation(page, width, 'Matchmaking')
    await expect(page.locator('.friends-mascot')).toHaveAttribute('src', '/prototype/friends/pebble-mascot.png')
    await page.screenshot({ path: testInfo.outputPath('friends-light.png'), fullPage: true })
    for (const path of ['/matchmaking?view=dating', '/downtime-matchmaking?view=dating']) {
      await page.goto(path)
      await expect(page.getByText('Local prototype recommendations — not live Dating matches.', { exact: true })).toBeVisible()
      await expect(page.locator('.friends-page')).toHaveCount(0)
      await whiteCanvas(page, '.pt-app')
      await whiteCanvas(page, '.pt-main')
      await expect(page.locator('[data-front]')).toHaveCSS('background-color', 'rgb(82, 97, 80)')
      await page.screenshot({ path: testInfo.outputPath(`${path.startsWith('/downtime') ? 'downtime-' : ''}dating-white-canvas.png`), fullPage: true })
    }
    await page.goto('/matchmaking')
    await expect(page.getByRole('button', { name: 'Find Friends', exact: true })).toBeEnabled()
    expect(await appearance()).toEqual(original)
    await whiteNavigation(page, width, 'Matchmaking')
    expect(writes).toEqual([])
    await testInfo.attach('computed-friends', { body: JSON.stringify(original, null, 2), contentType: 'application/json' })
  })
}
