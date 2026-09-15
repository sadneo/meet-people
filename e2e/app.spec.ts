import { expect, test } from '@playwright/test'

test('renders home, fallback routes, and API health', async ({ page, request }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Meet People' })).toBeVisible()

  await page.goto('/missing', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()

  const response = await request.get('/api/health')
  await expect(response).toBeOK()
  await expect(response.json()).resolves.toEqual({ status: 'ok' })
})
