import { expect, test } from '@playwright/test'
import { browserAccount, mockMatchingSession } from './matchmaking-fixture'

for (const [width, height] of [[320, 568], [390, 844], [800, 900], [801, 900], [1440, 900], [2560, 1440], [390, 420]]) {
  test(`downtime compatibility and Dating selector ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const forbidden: string[] = [], external: string[] = []
    await page.route('**/*', route => {
      const request = route.request(), url = new URL(request.url())
      if (url.origin !== 'http://127.0.0.1:3194') { external.push(url.origin); return route.abort() }
      if (url.pathname.startsWith('/api/')) {
        if (request.method() !== 'GET' || /\/(queue|result|status)$/.test(url.pathname)) forbidden.push(url.pathname)
        if (url.pathname.endsWith('/account')) return route.fulfill({ json: browserAccount() })
        return route.fulfill({ json: { notifications: [], unreadCount: 0 } })
      }
      return route.continue()
    })
    await mockMatchingSession(page)
    await page.goto('/downtime-matchmaking?source=layout')
    await expect(page.getByRole('heading', { name: 'Manage downtime in Settings', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open matchmaking settings', exact: true })).toHaveAttribute('href', '/settings')
    await expect(page.getByRole('button', { name: 'Turn on downtime matching', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Set up matching preferences', exact: true })).toHaveCount(0)
    const segments = page.getByRole('navigation', { name: 'Matching views', exact: true })
    const friends = segments.getByRole('link', { name: 'Friends', exact: true }), dating = segments.getByRole('link', { name: 'Dating', exact: true })
    await expect(friends).toHaveAttribute('aria-current', 'page')
    const track = await segments.evaluate(element => getComputedStyle(element).backgroundColor)
    expect(await friends.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(track)
    for (const link of [friends, dating, page.getByRole('link', { name: 'Open matchmaking settings', exact: true })]) {
      const box = (await link.boundingBox())!
      expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    await page.screenshot({ path: `worktree/active-settings-optin/selector-friends-${width}x${height}.png`, fullPage: true, animations: 'disabled' })
    await dating.focus(); await page.keyboard.press('Enter')
    await expect(page).toHaveURL('/downtime-matchmaking?source=layout&view=dating')
    await expect(page.getByRole('heading', { name: 'Dating in your downtime', exact: true })).toBeVisible()
    const action = page.getByRole('button', { name: 'Find a date in your downtime', exact: true })
    await expect(action).toBeDisabled(); await expect(action).toHaveAccessibleDescription('Dating backend not connected')
    await expect(page.locator('.dating-mascot .pt-pixel-pebble[data-expression="happy"] image')).toHaveCount(1)
    await expect(page.getByRole('navigation', { name: 'Matching modes', exact: true })).toHaveCount(1)
    const contrast = await dating.evaluate(element => {
      const context = document.createElement('canvas').getContext('2d')!
      const luminance = (color: string) => {
        context.fillStyle = color; context.fillRect(0, 0, 1, 1)
        const channels = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3).map(value => { const v = value / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 })
        return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722
      }
      const style = getComputedStyle(element), foreground = luminance(style.color), background = luminance(style.backgroundColor)
      return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05)
    })
    expect(contrast).toBeGreaterThanOrEqual(4.5)
    console.log(`Dating selector contrast ${width}: ${contrast.toFixed(2)}:1`)
    expect(await dating.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(await friends.evaluate(element => getComputedStyle(element).backgroundColor))
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    await action.scrollIntoViewIfNeeded(); await expect(action).toBeInViewport()
    await page.screenshot({ path: `worktree/active-settings-optin/selector-dating-${width}x${height}.png`, fullPage: true, animations: 'disabled' })
    await page.goBack(); await expect(friends).toHaveAttribute('aria-current', 'page')
    await page.goForward(); await expect(dating).toHaveAttribute('aria-current', 'page')
    await page.reload(); await expect(dating).toHaveAttribute('aria-current', 'page')
    await mockMatchingSession(page, false); await page.reload()
    await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
    await expect(action).toHaveCount(0)
    expect(forbidden).toEqual([]); expect(external).toEqual([])
  })
}
