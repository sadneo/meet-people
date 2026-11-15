import { expect, test } from '@playwright/test'

test('deletion request resource is usable without an account', async ({ page }) => {
  await page.goto('/delete-account')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Delete your Pebble account')
  await expect(page.getByRole('heading', { name: 'Request deletion by email' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'pebblesupport.help@gmail.com' })).toHaveAttribute('href', 'mailto:pebblesupport.help@gmail.com')
  await expect(page.getByText(/Signing out or uninstalling does not request account deletion/)).toBeVisible()
})
test('public child-safety standards identify prohibited conduct, reports and contact', async ({ page }) => {
  await page.goto('/child-safety')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Child safety standards')
  await expect(page.getByText(/Child sexual abuse material/)).toBeVisible()
  await expect(page.getByText(/subject “Child safety concern”/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'pebblesupport.help@gmail.com' })).toBeVisible()
})
