import { expect, test } from '@playwright/test'
import { browserAccount, browserProfile, mockMatchingSession } from './matchmaking-fixture'

for (const width of [320, 390, 1440]) {
  test(`authenticated downtime opt-in ${width}: consent, readback, reload, guarded off and active replacement`, async ({ page }) => {
    let mode: 'active' | 'downtime' | null = 'active'
    const writes: { method: string; body: unknown }[] = [], lookups: string[] = [], external: string[] = []
    await page.route('**/*', route => {
      const request = route.request(), url = new URL(request.url())
      if (url.origin !== 'http://127.0.0.1:3194') { external.push(url.origin); return route.abort() }
      return route.continue()
    })
    await page.route('**/api/matchmaking/**', route => {
      const request = route.request(), path = new URL(request.url()).pathname
      if (path.endsWith('/notifications')) return route.fulfill({ json: { notifications: [], unreadCount: 0 } })
      if (path.endsWith('/account')) return route.fulfill({ json: browserAccount() })
      if (path.endsWith('/account-profile')) return route.fulfill({ json: { profile: { username: browserProfile.username, display_name: browserProfile.display_name, bio: browserProfile.bio, avatar_url: browserProfile.avatar_url } } })
      if (path.endsWith('/profile')) return route.fulfill({ json: { profile: browserProfile } })
      if (path.endsWith('/result')) lookups.push(path)
      if (path.endsWith('/queue')) {
        writes.push({ method: request.method(), body: request.method() === 'POST' ? request.postDataJSON() : null })
        mode = request.method() === 'POST' ? request.postDataJSON().mode : null
      }
      return route.fulfill({ json: { mode } })
    })
    await mockMatchingSession(page)
    await page.setViewportSize({ width, height: width === 320 ? 568 : width === 390 ? 844 : 900 })
    await page.goto('/settings')
    const control = page.getByRole('switch', { name: 'Allow downtime matching', exact: true })
    await expect(control).toBeEnabled(); await expect(control).toHaveAttribute('aria-checked', 'false')
    await expect(page.getByText(/Enabling downtime replaces active matching/)).toBeVisible()
    expect(writes).toEqual([]); expect(lookups).toEqual([])
    await control.scrollIntoViewIfNeeded()
    const box = (await control.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    console.log(`Downtime Settings target ${width}: ${box.width}×${box.height}`)
    await page.screenshot({ path: `worktree/active-settings-optin/settings-${width}.png`, fullPage: true, animations: 'disabled' })
    await control.focus(); await page.keyboard.press('Space')
    const confirmation = page.getByRole('dialog', { name: 'Replace active matching?', exact: true })
    await expect(confirmation.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
    await page.screenshot({ path: `worktree/active-settings-optin/replacement-${width}.png`, animations: 'disabled' })
    await page.keyboard.press('Escape'); await expect(control).toBeFocused()
    expect(writes).toEqual([]); expect(mode).toBe('active')
    await control.click(); await confirmation.getByRole('button', { name: 'Replace with downtime', exact: true }).click()
    await expect(control).toHaveAttribute('aria-checked', 'true'); await expect(control).toBeEnabled()
    await expect(control).toBeFocused()
    expect(writes).toEqual([{ method: 'POST', body: { mode: 'downtime' } }])
    await page.reload(); await expect(control).toHaveAttribute('aria-checked', 'true'); await expect(control).toBeEnabled()
    expect(writes).toHaveLength(1)
    await control.click(); await expect(control).toHaveAttribute('aria-checked', 'false'); await expect(control).toBeEnabled()
    expect(writes.map(write => write.method)).toEqual(['POST', 'DELETE'])
    await control.click(); await expect(control).toHaveAttribute('aria-checked', 'true'); await expect(control).toBeEnabled()
    mode = 'active'
    await control.click(); await expect(control).toHaveAttribute('aria-checked', 'false'); await expect(control).toBeEnabled()
    expect(mode).toBe('active'); expect(writes.map(write => write.method)).toEqual(['POST', 'DELETE', 'POST'])
    mode = 'downtime'
    await page.getByRole('link', { name: 'Matchmaking', exact: true }).first().click()
    const start = page.getByRole('button', { name: 'Find Friends', exact: true })
    await expect(start).toBeEnabled(); await expect(page.getByText('Downtime matching is on. Starting active matching replaces downtime matching.', { exact: true })).toBeVisible()
    await start.click()
    await page.getByRole('dialog', { name: 'Replace downtime matching?', exact: true }).getByRole('button', { name: 'Replace with active search', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Cancel search', exact: true })).toBeEnabled()
    expect(mode).toBe('active'); expect(writes.at(-1)).toEqual({ method: 'POST', body: { mode: 'active' } })
    expect(writes.filter(write => write.method === 'DELETE')).toHaveLength(1)
    expect(lookups).toEqual([]); expect(external).toEqual([])
  })
}
