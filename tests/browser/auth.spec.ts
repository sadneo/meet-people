import { test, expect } from '@playwright/test'
import { mockMatchingSession } from './matchmaking-fixture'

test('private Home cannot become a guest preview while marketing and legal stay public', async ({ page }) => {
  await mockMatchingSession(page, false)
  const apiRequests: string[] = []
  await page.route('**/api/**', route => { apiRequests.push(route.request().url()); return route.abort() })
  for (const path of ['/home', '/matchmaking', '/messages', '/profile']) {
    await page.goto(path)
    await expect(page).toHaveURL(`/login?returnTo=${encodeURIComponent(path)}`)
    await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toHaveCount(0)
  }
  await page.goto('/welcome')
  await expect(page.getByRole('heading', { name: 'Find a little time in common.' })).toBeVisible()
  for (const path of ['/terms', '/privacy', '/cookies']) {
    await page.goto(path)
    await expect(page).toHaveURL(path)
    await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toHaveCount(0)
  }
  expect(apiRequests).toEqual([])
})
