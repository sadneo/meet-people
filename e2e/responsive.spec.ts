import { expect, test } from '@playwright/test'

for (const width of [320, 390, 799, 800, 801, 1280, 1800]) {
  test(`product layouts share the 800px boundary at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const compact = width <= 800
    await page.goto('/events')
    const gutters = await page.locator('.pt-main').evaluate(element => {
      const style = getComputedStyle(element)
      return [style.paddingLeft, style.paddingRight]
    })
    const headerHeight = (await page.locator('.pt-app-header').boundingBox())?.height
    const brandDotColor = await page.locator('.pt-brand-dot').evaluate(element => getComputedStyle(element).color)
    const shellFonts = await page.locator('.pt-app-header, .pt-bottom-nav').evaluateAll(elements => elements.map(element => getComputedStyle(element).font))
    const brandFont = await page.locator('.pt-brand').evaluate(element => getComputedStyle(element).font)
    for (const route of ['/', '/events', '/events/detail', '/matchmaking', '/downtime-matchmaking', '/messages', '/messages/chat', '/profile', '/settings', '/free-time', '/free-time/matches', '/free-time/plan', '/register', '/onboarding']) {
      if (route === '/free-time/plan') {
        await page.goto('/messages/chat')
        await page.getByRole('button', { name: 'Make a plan', exact: true }).click()
        await expect(page).toHaveURL(route)
      } else {
        await page.goto(route)
      }
      await expect(page.locator('.pt-main')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth), route).toBeLessThanOrEqual(width)

      if (['/register', '/onboarding'].includes(route)) {
        expect(await page.locator('.pt-app').evaluate(element => getComputedStyle(element).getPropertyValue('--pt-navigation-clearance').trim())).toBe('0px')
        continue
      }
      await expect(page.locator('.pt-app-header')).toBeVisible({ visible: !compact })
      await expect(page.locator('.pt-bottom-nav')).toBeVisible({ visible: compact })
      expect(await page.locator('.pt-app-header, .pt-bottom-nav').evaluateAll(elements => elements.map(element => getComputedStyle(element).font)), `${route} shell typography`).toEqual(shellFonts)
      for (const font of await page.locator('.pt-brand').evaluateAll(elements => elements.map(element => getComputedStyle(element).font))) {
        expect(font, `${route} brand typography`).toBe(brandFont)
      }
      for (const color of await page.locator('.pt-brand-dot').evaluateAll(elements => elements.map(element => getComputedStyle(element).color))) {
        expect(color, `${route} brand dot`).toBe(brandDotColor)
      }
      if (route !== '/') {
        expect(await page.locator('.pt-main').evaluate(element => {
          const style = getComputedStyle(element)
          return [style.paddingLeft, style.paddingRight]
        }), `${route} shell gutters`).toEqual(gutters)
      }
      if (!compact) {
        expect((await page.locator('.pt-app-header').boundingBox())!.height, `${route} header height`).toBe(headerHeight)
        expect(await page.locator('.pt-desktop-nav').evaluate(element => getComputedStyle(element).transform), `${route} navigation offset`).toBe('none')
      }

      if (route === '/profile') {
        await expect(page.locator('.pt-profile-mobile-header')).toBeVisible({ visible: compact })
        if (compact) {
          const portrait = await page.locator('.pt-profile-portrait').boundingBox()
          const edit = await page.getByRole('button', { name: 'Edit profile', exact: true }).boundingBox()
          expect(edit!.x).toBeGreaterThanOrEqual(portrait!.x + portrait!.width)
          expect(edit!.height).toBeGreaterThanOrEqual(44)
        }
      }

      if (route.startsWith('/messages')) {
        await expect(page.locator('.pt-inbox-pane')).toBeVisible({ visible: !compact || route === '/messages' })
        await expect(page.locator('.pt-conversation-pane')).toBeVisible({ visible: !compact || route === '/messages/chat' })
        if (route === '/messages/chat') {
          const composer = await page.locator('.pt-composer').boundingBox()
          const navigation = compact ? await page.locator('.pt-bottom-nav').boundingBox() : null
          expect(composer!.y + composer!.height).toBeLessThanOrEqual(navigation?.y ?? 844)
        }
      }
      const grid = route === '/profile' ? '.pt-profile-support' : route === '/free-time/plan' ? '.pt-planning-grid' : route === '/matchmaking' ? '.match-detail-grid' : null
      if (grid) {
        const columns = await page.locator(grid).evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)
        expect(columns, route).toBe(compact ? 1 : 2)
      }
      if (['/matchmaking', '/downtime-matchmaking'].includes(route)) {
        await page.getByRole('button', { name: 'Preferences', exact: true }).click()
        const alignment = await page.locator('.match-preferences-backdrop').evaluate(element => getComputedStyle(element).alignItems)
        expect(alignment).toBe(compact ? 'end' : 'center')
        const panel = await page.locator('.match-preferences').boundingBox()
        const navigation = compact ? await page.locator('.pt-bottom-nav').boundingBox() : null
        expect(panel!.y + panel!.height).toBeLessThanOrEqual(navigation?.y ?? 844)
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
        await page.keyboard.press('Escape')
      }
    }

    await page.goto('/events')
    await page.getByRole('button', { name: 'View Coffee & conversation', exact: true }).click()
    await expect(page).toHaveURL('/events/detail')
  })
}

test('an existing messaging workspace switches with navigation when resized', async ({ page }) => {
  await page.goto('/messages/chat')
  for (const width of [801, 800, 799, 801]) {
    await page.setViewportSize({ width, height: 844 })
    await expect(page.locator('.pt-app-header')).toBeVisible({ visible: width > 800 })
    await expect(page.locator('.pt-bottom-nav')).toBeVisible({ visible: width <= 800 })
    await expect(page.locator('.pt-inbox-pane')).toBeVisible({ visible: width > 800 })
    await expect(page.locator('.pt-conversation-pane')).toBeVisible()
    await expect(page.locator('.pt-chat-back')).toBeVisible({ visible: width <= 800 })
  }
})

test('navigation and preferences share safe-area clearance on a short screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 480 })
  await page.goto('/matchmaking')
  await page.evaluate(() => document.body.style.setProperty('--pt-safe-area-bottom', '24px'))
  const navigation = await page.locator('.pt-bottom-nav').boundingBox()
  expect(navigation!.height).toBe(96)
  await page.getByRole('button', { name: 'Preferences', exact: true }).click()
  const panel = page.locator('.match-preferences')
  await expect(panel).toBeVisible()
  const bounds = await panel.boundingBox()
  expect(bounds!.y).toBeGreaterThanOrEqual(0)
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(navigation!.y)
  await expect(panel.getByRole('button', { name: 'Save preferences' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()

  await page.goto('/')
  await page.evaluate(() => document.body.style.setProperty('--pt-safe-area-bottom', '24px'))
  const entry = await page.locator('.pt-matchmaking-entry').boundingBox()
  expect(entry!.y + entry!.height).toBeLessThanOrEqual(navigation!.y)
})
