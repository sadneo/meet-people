import { expect, test } from '@playwright/test'
import { wiringFixture } from './wiring-fixture'

for (const settings of [false, true]) {
  test(`${settings ? 'account settings' : 'registration'} supports native password copy and paste after revealing`, async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.setViewportSize({ width: 320, height: 740 })
    await wiringFixture(page, { guest: !settings })
    await page.goto(settings ? '/profile?section=account' : '/register?email=clipboard-fixture%40example.test')
    if (settings) await page.locator('summary').filter({ hasText: 'Change password' }).click()
    const password = page.getByLabel(settings ? 'New password' : 'Password', { exact: true })
    const confirmation = page.getByLabel('Confirm password', { exact: true })
    const value = 'Synthetic-copy-and-paste-1!'
    await password.fill(value)
    await expect(password).toHaveAttribute('type', 'password')
    await expect(confirmation).toHaveAttribute('type', 'password')
    await page.getByRole('button', { name: settings ? 'Show new password' : 'Show password', exact: true }).click()
    await expect(password).toHaveAttribute('type', 'text')
    try {
      await password.focus()
      await password.press('ControlOrMeta+A')
      await password.press('ControlOrMeta+C')
      await confirmation.focus()
      await confirmation.press('ControlOrMeta+V')
      await expect(confirmation).toHaveValue(value)
    } finally { await page.evaluate(() => navigator.clipboard.writeText('')) }
    await page.getByRole('button', { name: settings ? 'Hide new password' : 'Hide password', exact: true }).click()
    await expect(password).toHaveAttribute('type', 'password')
    await expect(password).toHaveValue(value)
    await page.getByRole('button', { name: 'Show confirm password', exact: true }).click()
    await expect(confirmation).toHaveAttribute('type', 'text')
    await expect(confirmation).toHaveValue(value)
    await page.getByRole('button', { name: 'Hide confirm password', exact: true }).click()
    await expect(confirmation).toHaveAttribute('type', 'password')
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
