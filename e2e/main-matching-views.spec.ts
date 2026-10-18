import { expect, test, type Locator } from '@playwright/test'
import { mockMatchingApi, mockMatchingSession } from './matchmaking-fixture'

async function checkContrast(link: Locator) {
  const ratio = await link.evaluate(element => {
    const context = document.createElement('canvas').getContext('2d')!
    const luminance = (color: string) => {
      context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1)
      const channels = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3).map(value => { const v = value / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 })
      return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722
    }
    const style = getComputedStyle(element)
    const background = style.backgroundColor === 'rgba(0, 0, 0, 0)' ? getComputedStyle(element.parentElement!).backgroundColor : style.backgroundColor
    const a = luminance(style.color), b = luminance(background)
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05)
  })
  expect(ratio).toBeGreaterThanOrEqual(4.5)
  return ratio
}

for (const width of [320, 1440]) {
  for (const state of ['missing', 'saved', 'signed-out']) {
    test(`main selector ${state} Friends ${width}: no product Settings shortcut`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 900 })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await mockMatchingSession(page, state !== 'signed-out')
      await mockMatchingApi(page)
      if (state === 'missing') await page.route('**/api/matchmaking/profile', route => route.fulfill({ json: { profile: null } }))
      const forbidden: string[] = []
      page.on('request', request => { if (request.url().includes('/api/') && (request.method() !== 'GET' || /\/(queue|result)$/.test(new URL(request.url()).pathname))) forbidden.push(request.url()) })
      await page.goto('/matchmaking')
      if (state === 'signed-out') {
        await expect(page).toHaveURL('/login?returnTo=%2Fmatchmaking')
        await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
        await expect(page.getByRole('navigation', { name: 'Matching views', exact: true })).toHaveCount(0)
        expect(forbidden).toEqual([])
        return
      }
      if (state === 'missing') {
        await expect(page.getByRole('heading', { name: 'Complete onboarding', exact: true })).toBeVisible()
        await expect(page.locator('.pt-app')).toHaveCount(0)
        await expect(page.getByRole('navigation', { name: 'Matching views', exact: true })).toHaveCount(0)
        await expect(page.getByLabel('City or campus area')).toHaveValue('')
        expect(forbidden).toEqual([])
        return
      }
      const selector = page.getByRole('navigation', { name: 'Matching views', exact: true })
      await expect(selector).toBeVisible()
      const colors = await selector.evaluate(element => {
        const style = getComputedStyle(element)
        const resolve = (token: string) => { const sample = document.createElement('span'); sample.style.background = `var(${token})`; element.append(sample); const color = getComputedStyle(sample).backgroundColor; sample.remove(); return color }
        const links = element.querySelectorAll('a')
        return { track: style.backgroundColor, surface: resolve('--pt-surface'), pale: resolve('--pt-pale'), friends: getComputedStyle(links[0]).backgroundColor, dating: getComputedStyle(links[1]).backgroundColor }
      })
      expect(colors.track).toBe(colors.surface)
      expect(colors.friends).toBe(colors.pale)
      expect(colors.dating).toBe('rgba(0, 0, 0, 0)')
      await expect(selector.getByRole('link', { name: 'Friends', exact: true })).toHaveAttribute('aria-current', 'page')
      await expect(selector.getByRole('link', { name: 'Friends', exact: true })).toHaveAttribute('href', '/matchmaking')
      await expect(selector.getByRole('link', { name: 'Dating', exact: true })).toHaveAttribute('href', '/matchmaking?view=dating')
      if (state === 'missing') {
        await expect(page.getByRole('region', { name: 'Find your people', exact: true })).toBeVisible()
        await expect(page.getByText('0/30 selected', { exact: true })).toBeVisible()
        for (const label of ['Music', 'Coffee', 'Outdoors']) await expect(page.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'false')
      }
      if (state === 'saved') await expect(page.getByRole('button', { name: 'Preferences', exact: true })).toBeVisible()
      if (state === 'signed-out') await expect(page.getByRole('heading', { name: 'Sign in to match', exact: true })).toBeVisible()
      await expect(page.locator('main a[href="/settings"]')).toHaveCount(0)
      await expect(page.getByRole('link', { name: 'Matchmaking settings', exact: true })).toHaveCount(0)
      await expect(page.locator('.dating-view')).toHaveCount(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
      for (const link of await selector.getByRole('link').all()) {
        const box = (await link.boundingBox())!
        expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44)
        await checkContrast(link)
      }
      if (state === 'missing') await page.screenshot({ path: `worktree/interest-selection-review/selector-friends-${width}.png`, fullPage: true, animations: 'disabled' })
      expect(forbidden).toEqual([])
    })
  }
  for (const path of ['/matchmaking', '/downtime-matchmaking']) {
    test(`isolated Dating ${path} ${width}: exact content, keyboard/history/reload, no matching requests`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 900 })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await mockMatchingSession(page)
      await mockMatchingApi(page)
      const requests: { path: string; method: string }[] = []
      page.on('request', request => { if (request.url().includes('/api/matchmaking/')) requests.push({ path: new URL(request.url()).pathname, method: request.method() }) })
      const url = `${path}?source=correction&view=dating`
      await page.goto(url)
      const dating = page.getByRole('link', { name: 'Dating', exact: true }), friends = page.getByRole('link', { name: 'Friends', exact: true })
      const heading = page.getByRole('heading', { name: 'Dating in your downtime', exact: true })
      await expect(heading).toBeVisible()
      console.log(`Main selector Dating ${width}: ${(await checkContrast(dating)).toFixed(2)}:1; Friends ${(await checkContrast(friends)).toFixed(2)}:1`)
      await expect(page.getByText('Free time in common, room for a little spark.', { exact: true })).toBeVisible()
      await expect(page.getByText('Your Friends queue stays as it is.', { exact: true })).toBeVisible()
      const action = page.getByRole('button', { name: 'Find a date in your downtime', exact: true })
      await expect(action).toBeDisabled(); await expect(action).toHaveAccessibleDescription('Dating backend not connected')
      await expect(page.getByRole('region', { name: 'Dating in your downtime' }).getByRole('button')).toHaveCount(1)
      await expect(page.locator('.dating-mascot .pt-pixel-pebble[data-expression="happy"] image')).toHaveCount(1)
      await expect(page.locator('.dating-heart-thought')).toHaveAttribute('aria-hidden', 'true')
      expect(requests.length).toBeGreaterThan(0)
      expect(requests.every(request => request.method === 'GET' && /^\/api\/matchmaking\/(account-profile|profile)$/.test(request.path))).toBe(true)
      await page.reload(); await expect(dating).toHaveAttribute('aria-current', 'page')
      expect(requests.every(request => request.method === 'GET' && /^\/api\/matchmaking\/(account-profile|profile)$/.test(request.path))).toBe(true)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
      await action.scrollIntoViewIfNeeded(); await expect(action).toBeInViewport()
      if (path === '/matchmaking') await page.screenshot({ path: `worktree/interest-selection-review/selector-dating-${width}.png`, fullPage: true, animations: 'disabled' })
      await friends.focus(); await page.keyboard.press('Enter')
      await expect(page).toHaveURL(`${path}?source=correction`)
      if (path === '/matchmaking') await expect(page.getByRole('button', { name: 'Find Friends', exact: true })).toBeEnabled()
      else await expect(page.getByRole('heading', { name: 'Manage downtime in Settings', exact: true })).toBeVisible()
      await page.waitForLoadState('networkidle')
      const beforeDating = requests.length
      await friends.focus(); await page.keyboard.press('Tab'); await expect(dating).toBeFocused()
      expect(await dating.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe('none')
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(url); await expect(heading).toBeVisible()
      expect(requests).toHaveLength(beforeDating)
      await page.goBack(); await expect(friends).toHaveAttribute('aria-current', 'page')
      await page.waitForLoadState('networkidle')
      const beforeForward = requests.length
      await page.goForward(); await expect(dating).toHaveAttribute('aria-current', 'page')
      await page.reload(); await expect(heading).toBeVisible()
      expect(requests.slice(beforeForward).every(request => request.method === 'GET' && /^\/api\/matchmaking\/(account-profile|profile)$/.test(request.path))).toBe(true)
      expect(requests.every(request => request.method === 'GET' && !/\/(queue|result)$/.test(request.path))).toBe(true)
      const beforeSignOut = requests.length
      await mockMatchingSession(page, false); await page.reload(); await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
      await expect(heading).toHaveCount(0)
      expect(requests).toHaveLength(beforeSignOut)
    })
  }
}
