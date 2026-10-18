import { expect, test } from '@playwright/test'
import { sharedProfileFixture } from './shared-profile-fixture'

for (const [width, height] of [[320, 568], [320, 400], [390, 844], [801, 900], [1440, 900]]) {
  test(`shared profile editor ${width}x${height}: 30-label contract, accessible table, cancel/X/Escape and overflow`, async ({ page }) => {
    const fixture = await sharedProfileFixture(page, { interests: Array.from({ length: 30 }, (_, index) => `Label ${index + 1}`) })
    await page.setViewportSize({ width, height })
    await page.goto('/profile')
    const edit = page.getByRole('button', { name: 'Edit profile', exact: true })
    const editor = page.getByRole('dialog', { name: 'Edit your profile', exact: true })
    for (const close of ['Cancel', 'Close dialog', 'Escape']) {
      await edit.click()
      await expect(editor.getByRole('button', { name: 'Save shared preferences', exact: true })).toBeEnabled()
      const input = editor.getByLabel('Add a matching interest')
      await input.fill('Unsent label')
      await expect(editor.getByRole('button', { name: 'Add interest', exact: true })).toBeDisabled()
      await editor.getByRole('button', { name: 'Label 30', exact: true }).click()
      await editor.getByRole('button', { name: 'Add interest', exact: true }).click()
      await expect(editor.getByRole('button', { name: 'Unsent label', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await expect(editor.getByRole('table', { name: 'Weekly availability', exact: true }).getByRole('button')).toHaveCount(28)
      await editor.getByRole('button', { name: 'Monday morning, not available', exact: true }).focus()
      await page.keyboard.press('Space')
      await expect(editor.getByRole('button', { name: 'Monday morning, available', exact: true })).toHaveAttribute('aria-pressed', 'true')
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
      expect(await editor.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
      const save = editor.getByRole('button', { name: 'Save shared preferences', exact: true })
      await save.scrollIntoViewIfNeeded(); await expect(save).toBeInViewport()
      if (close === 'Cancel') await page.screenshot({ path: `worktree/shared-profile/editor-cap-${width}x${height}.png`, animations: 'disabled' })
      if (close === 'Escape') await page.keyboard.press('Escape')
      else await editor.getByRole('button', { name: close, exact: true }).click()
      await expect(editor).toHaveCount(0); await expect(edit).toBeFocused()
    }
    await edit.click()
    await expect(editor.getByRole('button', { name: 'Label 30', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(editor.getByRole('button', { name: 'Monday morning, not available', exact: true })).toHaveAttribute('aria-pressed', 'false')
    expect(fixture.calls.some(call => call.method !== 'GET' || /\/(queue|result)$/.test(call.path))).toBe(false)
    expect(fixture.external).toEqual([])
  })
}

test('shared profile interests retain multiline labels and reject duplicates without a write', async ({ page }) => {
  const fixture = await sharedProfileFixture(page, { interests: ['Board games\nstrategy', 'Coffee', 'Art'] })
  await page.goto('/profile')
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click()
  const editor = page.getByRole('dialog')
  await expect(editor.getByRole('button', { name: /Board games\s+strategy/ })).toHaveAttribute('aria-pressed', 'true')
  await editor.getByLabel('Add a matching interest').fill('Coffee')
  await expect(editor.getByText('That interest is already selected.', { exact: true })).toBeVisible()
  await expect(editor.getByRole('button', { name: 'Add interest', exact: true })).toBeDisabled()
  expect(fixture.calls.some(call => call.method !== 'GET')).toBe(false)
})
