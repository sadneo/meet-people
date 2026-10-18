import { expect, test } from '@playwright/test'
import { mockMatchingApi, mockMatchingSession } from './matchmaking-fixture'

for (const signedIn of [true, false]) {
  for (const width of [320, 801, 1440]) {
    test(`Settings account actions ${signedIn ? 'signed-in' : 'signed-out'} at ${width}: credentials and keyboard action`, async ({ page }) => {
      const external: string[] = [], mutations: string[] = []
      await page.route('**/*', route => {
        const url = new URL(route.request().url())
        if (url.origin !== 'http://127.0.0.1:3194') { external.push(url.origin); return route.abort() }
        if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 503, json: { code: 'unavailable', error: 'Mock boundary only.' } })
        return route.continue()
      })
      await mockMatchingSession(page, signedIn)
      await mockMatchingApi(page)
      page.on('request', request => { if (request.url().includes('/api/') && request.method() !== 'GET') mutations.push(request.url()) })
      await page.setViewportSize({ width, height: width === 320 ? 568 : 900 })
      await page.goto('/settings')
      if (!signedIn) {
        await expect(page).toHaveURL('/login?returnTo=%2Fsettings')
        await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
        await expect(page.getByRole('region', { name: 'Account actions' })).toHaveCount(0)
        expect(mutations).toEqual([]); expect(external).toEqual([])
        return
      }
      const settings = page.locator('.pt-settings')
      const actions = page.getByRole('region', { name: 'Account actions' })
      await expect(actions.getByText('Email & password', { exact: true })).toBeVisible()
      await expect(actions.getByRole('textbox')).toHaveCount(0)
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(actions).toContainText(signedIn ? 'Manage your sign-in email and password.' : 'Sign in to manage your email and password.')
      const standardText = settings.getByText('Campus location (demo)', { exact: true })
      const standardStart = await standardText.evaluate(element => element.getBoundingClientRect().left)
      for (const label of ['Email & password', signedIn ? 'Log out' : 'Sign in to Pebble']) {
        const textStart = await actions.locator('strong').filter({ hasText: label }).evaluate(element => element.getBoundingClientRect().left)
        expect(Math.abs(textStart - standardStart), `${label} aligns with standard Settings row text`).toBeLessThanOrEqual(1)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
      await page.screenshot({ path: `worktree/settings-account-actions/settings-alignment-${signedIn ? 'signed-in' : 'signed-out'}-${width}.png`, fullPage: true })
      await actions.screenshot({ path: `worktree/settings-account-actions/account-actions-${signedIn ? 'signed-in' : 'signed-out'}-${width}.png` })
      const manage = actions.getByRole('button', { name: 'Manage', exact: true })
      await manage.focus()
      await page.keyboard.press('Enter')
      const dialog = page.getByRole('dialog', { name: 'Email & password', exact: true })
      const credentials = dialog.getByRole('group', { name: 'Email & password', exact: true })
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole('heading', { name: 'Email & password', exact: true })).toHaveCount(1)
      await expect(credentials.getByRole('heading')).toHaveCount(0)
      await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0)
      await expect(dialog.getByRole('button', { name: 'Close dialog', exact: true })).toBeVisible()
      expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true)
      // Native modal inertness prevents background controls from taking focus.
      await manage.evaluate(element => element.focus())
      expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true)
      await page.keyboard.press('Shift+Tab')
      // Chromium may pass through browser chrome (body), never a background control.
      expect(await dialog.evaluate(element => document.activeElement === document.body || element.contains(document.activeElement))).toBe(true)
      await page.keyboard.press('Tab')
      expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true)
      await expect(settings.getByRole('heading', { name: 'Profile', exact: true })).toHaveCount(0)
      await expect(settings.getByRole('link', { name: 'Profile', exact: true })).toHaveCount(0)
      await expect(credentials).toContainText('Manage the email address you use to sign in and your password.')
      if (signedIn) {
        await expect(credentials.getByRole('textbox', { name: 'Sign-in email' })).toHaveValue('browser@example.test')
        await expect(credentials.getByLabel('New password', { exact: true })).toHaveAttribute('type', 'password')
        await expect(credentials.getByLabel('New password', { exact: true })).toHaveAttribute('autocomplete', 'new-password')
        await expect(credentials.getByLabel('Confirm new password')).toHaveAttribute('type', 'password')
        await expect(credentials.getByLabel('Confirm new password')).toHaveAttribute('autocomplete', 'new-password')
        await expect(credentials.getByText('Use 8–128 characters.', { exact: true })).toBeVisible()
        await expect(credentials).not.toContainText('Email changes and password changes are saved separately.')
        await expect(credentials).not.toContainText('Verify an email before setting a password')
        await expect(credentials.getByRole('button', { name: 'Save email' })).toBeDisabled()
        await expect(credentials.getByRole('button', { name: 'Save password' })).toBeDisabled()
        const geometry = await dialog.evaluate(element => {
          const email = element.querySelector('form[aria-label="Update email"]')!
          const password = element.querySelector('form[aria-label="Update password"]')!
          const gaps = [email, password].flatMap(form => Array.from(form.children).slice(1).map(child => child.getBoundingClientRect().top - child.previousElementSibling!.getBoundingClientRect().bottom))
          return {
            gaps,
            sectionGap: password.getBoundingClientRect().top - email.getBoundingClientRect().bottom,
            targetHeights: Array.from(element.querySelectorAll('button, input')).map(control => control.getBoundingClientRect().height),
            contentHeight: element.scrollHeight,
            visibleHeight: element.clientHeight,
          }
        })
        console.log(`Credential dialog geometry ${width}: ${JSON.stringify(geometry)}`)
        for (const gap of geometry.gaps) {
          expect(gap).toBeGreaterThanOrEqual(8)
          expect(gap).toBeLessThanOrEqual(12)
        }
        expect(geometry.sectionGap).toBeGreaterThanOrEqual(12)
        expect(geometry.sectionGap).toBeLessThanOrEqual(24)
        for (const height of geometry.targetHeights) expect(height).toBeGreaterThanOrEqual(44)
        await page.screenshot({ path: `worktree/settings-account-actions/compact-credentials-${width}.png` })
        await credentials.getByRole('button', { name: 'Save password', exact: true }).scrollIntoViewIfNeeded()
        await expect(credentials.getByRole('button', { name: 'Save password', exact: true })).toBeInViewport()
        if (width === 320) await page.screenshot({ path: 'worktree/settings-account-actions/compact-credentials-320-scrolled.png' })
        await dialog.evaluate(element => { element.scrollTop = 0 })
      } else {
        await expect(credentials.getByRole('textbox')).toHaveCount(0)
        await expect(credentials).toContainText('Sign in from Settings to manage your credentials.')
      }
      await expect(page.locator('body')).not.toContainText(/refresh account status/i)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
      expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
      await dialog.screenshot({ path: `worktree/settings-account-actions/credentials-dialog-${signedIn ? 'signed-in' : 'signed-out'}-${width}.png` })
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
      await expect(manage).toBeFocused()
      await page.keyboard.press('Enter')
      await dialog.getByRole('button', { name: 'Close dialog', exact: true }).focus()
      await page.keyboard.press('Enter')
      await expect(dialog).toHaveCount(0)
      await expect(manage).toBeFocused()
      await expect(actions).not.toContainText(/Supabase|purchases/)
      await expect(actions.getByText(signedIn ? 'Sign out of Pebble on this browser.' : 'Sign in to access your account.', { exact: true })).toBeVisible()
      await expect(actions.locator('strong').filter({ hasText: signedIn ? /^Log out$/ : /^Sign in to Pebble$/ })).toBeVisible()
      const action = signedIn ? actions.getByRole('button', { name: 'Log out', exact: true }) : actions.getByRole('link', { name: 'Sign in', exact: true })
      await expect(action).toBeEnabled()
      await action.focus()
      await expect(action).toBeFocused()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
      expect(await actions.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL('/login?returnTo=%2Fsettings')
      expect(external).toEqual([])
      expect(mutations).toEqual([])
    })
  }
}
