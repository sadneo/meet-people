import { expect, test } from '@playwright/test'
import { browserAccount, mockMatchingSession } from './matchmaking-fixture'

for (const [width, height] of [[320, 568], [390, 844], [800, 900], [801, 900], [1440, 900], [2560, 1440], [390, 420]]) {
  test(`downtime compatibility and Dating selector ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const forbidden: string[] = [], external: string[] = []
    let datingPhase = false
    await page.route('**/*', route => {
      const request = route.request(), url = new URL(request.url())
      if (url.origin !== 'http://127.0.0.1:3194') { external.push(url.origin); return route.abort() }
      if (url.pathname.startsWith('/api/')) {
        if (request.method() !== 'GET' || /\/(queue|result|status)$/.test(url.pathname) || (datingPhase && url.pathname !== '/api/matchmaking/account')) forbidden.push(url.pathname)
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
    await page.waitForLoadState('networkidle')
    datingPhase = true
    await dating.focus(); await page.keyboard.press('Enter')
    await expect(page).toHaveURL('/downtime-matchmaking?source=layout&view=dating')
    await expect(page.getByRole('heading', { name: 'Dating in your downtime', exact: true })).toBeVisible()
    const disclosure = 'Local prototype recommendations — not live Dating matches.'
    const region = page.getByRole('region', { name: 'Dating in your downtime', exact: true })
    await expect(region.getByText(disclosure, { exact: true })).toBeVisible()
    await expect(region.locator('[data-dating-card]')).toHaveCount(3)
    const front = region.getByRole('article', { name: 'Ari, 24, prototype recommendation', exact: true })
    await expect(region.getByRole('article')).toHaveCount(1)
    await expect(front).toHaveAttribute('data-front', 'true')
    await expect(front.getByRole('heading', { name: 'Ari, 24', exact: true })).toBeVisible()
    const info = front.locator('.dating-card-info')
    await expect(info).toHaveText('Art walks · coffee stops')
    expect(await info.evaluate(element => element.scrollWidth <= element.clientWidth && element.getBoundingClientRect().height <= Number.parseFloat(getComputedStyle(element).lineHeight) + 1)).toBe(true)
    await expect(front.getByRole('list', { name: 'Prototype interests', exact: true }).getByRole('listitem')).toHaveCount(3)
    const action = region.getByRole('button', { name: 'Like recommendation', exact: true })
    const skip = region.getByRole('button', { name: 'Skip recommendation', exact: true })
    await expect(region.getByRole('button')).toHaveCount(6)
    for (const control of [skip, action]) {
      await expect(control).toBeEnabled(); await expect(control).toHaveAccessibleDescription(disclosure)
      const box = (await control.boundingBox())!
      expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44)
    }
    await expect(skip.locator('svg')).toHaveAttribute('data-icon', 'x')
    await expect(action.locator('svg')).toHaveAttribute('data-icon', 'heart')
    await expect(page.getByRole('navigation', { name: 'Matching modes', exact: true })).toHaveCount(0)
    const contrast = await dating.evaluate(element => {
      const context = document.createElement('canvas').getContext('2d')!
      const luminance = (color: string) => {
        context.fillStyle = color; context.fillRect(0, 0, 1, 1)
        const channels = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3).map(value => { const v = value / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 })
        return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722
      }
      const style = getComputedStyle(element), foreground = luminance(style.color), selection = getComputedStyle(element.parentElement!, '::before'), background = luminance(selection.content !== 'none' ? selection.backgroundColor : style.backgroundColor)
      return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05)
    })
    expect(contrast).toBeGreaterThanOrEqual(4.5)
    console.log(`Dating selector contrast ${width}: ${contrast.toFixed(2)}:1`)
    const selection = await segments.evaluate(element => {
      const surface = getComputedStyle(element, '::before')
      return { background: surface.backgroundColor, shift: new DOMMatrixReadOnly(surface.transform).m41 }
    })
    expect(selection.background).toBe('rgb(250, 249, 245)')
    expect(selection.shift).toBeGreaterThan(0)
    expect(await dating.evaluate(element => getComputedStyle(element).color)).not.toBe(await friends.evaluate(element => getComputedStyle(element).color))
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    await action.scrollIntoViewIfNeeded(); await expect(action).toBeInViewport()
    await page.screenshot({ path: `worktree/dating-prototype/selector-downtime-deck-${width}x${height}.png`, fullPage: true, animations: 'disabled' })
    datingPhase = false
    await page.goBack(); await expect(friends).toHaveAttribute('aria-current', 'page')
    await page.waitForLoadState('networkidle')
    datingPhase = true
    await page.goForward(); await expect(dating).toHaveAttribute('aria-current', 'page')
    await page.reload(); await expect(dating).toHaveAttribute('aria-current', 'page')
    await mockMatchingSession(page, false); await page.reload()
    await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
    await expect(action).toHaveCount(0)
    expect(forbidden).toEqual([]); expect(external).toEqual([])
  })
}
