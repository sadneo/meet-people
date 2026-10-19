import { expect, test } from '@playwright/test'
import { mockMatchingApi, mockMatchingSession } from './matchmaking-fixture'
import { mkdir } from 'node:fs/promises'

const shots = 'output/public-review'
test.beforeAll(async () => { await mkdir(shots, { recursive: true }) })

for (const width of [320, 390, 800, 1280, 1440, 2560]) {
  test(`marketing and legal pages at ${width}px`, async ({ page }) => {
    await mockMatchingSession(page, false)
    await page.setViewportSize({ width, height: width < 801 ? 844 : 900 })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Find a little time in common.' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Public navigation' }).getByRole('link', { name: 'Get started' })).toHaveCount(0)
    await expect(page.getByRole('main').getByRole('link', { name: 'Get started', exact: true })).toHaveAttribute('href', '/register?returnTo=%2F')
    await expect(page.getByRole('link', { name: 'Create an account', exact: true })).toHaveAttribute('href', '/register?returnTo=%2F')
    await expect(page.getByRole('main').getByRole('link', { name: 'Sign in', exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Find your people', exact: true })).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: 'Public navigation' }).getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', '/login?returnTo=%2F')
    await expect(page.getByRole('navigation', { name: 'Footer navigation' }).getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', '/login?returnTo=%2F')
    await expect(page.getByRole('navigation', { name: 'Public navigation' }).getByRole('link', { name: 'Explore events' })).toHaveAttribute('href', '/events')
    await expect(page.getByRole('button', { name: 'Developer controls' })).toHaveCount(0)
    await expect(page.locator('.pt-bottom-nav')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect(await page.evaluate(() => localStorage.getItem('pebble:full-ui:community:v1'))).toBeNull()
    await page.locator('.marketing-community-media').scrollIntoViewIfNeeded()
    await expect(page.locator('.marketing-community-media')).toHaveAttribute('data-visible', 'true')
    if (await page.locator('.marketing-build-loop').count()) {
      await expect(page.locator('.marketing-build-loop')).toHaveCSS('opacity', '1')
    }
    await page.screenshot({ path: `${shots}/landing-${width}.png`, fullPage: true })
    for (const [title, route] of [['Terms of Service', '/terms'], ['Privacy Policy', '/privacy'], ['Cookie Policy', '/cookies']]) {
      await page.getByRole('navigation', { name: 'Footer navigation' }).getByRole('link', { name: title, exact: true }).click()
      await expect(page).toHaveURL(new RegExp(`${route}$`))
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
      await expect(page.getByRole('navigation', { name: 'Public navigation' }).getByRole('link', { name: 'Get started', exact: true })).toBeVisible()
      await expect(page.getByText('[TO BE CONFIRMED BEFORE PUBLICATION]', { exact: true })).toHaveCount(2)
      expect(await page.locator('.legal-copy').innerText()).not.toMatch(/\bdraft\b/i)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    }
    await page.screenshot({ path: `${shots}/cookies-${width}.png`, fullPage: true })
  })
}

test('marketing signup/sign-in links hand off to existing auth without changing it', async ({ page }) => {
  await mockMatchingSession(page, false)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('link', { name: 'Skip to content' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('main')).toBeFocused()
  const animated = await page.locator('.public-site *').evaluateAll(elements => elements.some(element => getComputedStyle(element).animationName !== 'none'))
  expect(animated).toBe(false)
  await page.getByRole('main').getByRole('link', { name: 'Get started', exact: true }).click()
  await expect(page).toHaveURL(/\/register\?returnTo=%2F$/)
  await expect(page.getByRole('heading', { name: 'Welcome to Pebble', exact: true })).toBeVisible()
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible()
  await page.goto('/')
  await page.getByRole('navigation', { name: 'Public navigation' }).getByRole('link', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/login\?returnTo=%2F$/)
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible()
})

test('signed-in root retains Home, while legal pages bypass failed account loading', async ({ page }) => {
  await mockMatchingSession(page)
  await mockMatchingApi(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Who’s around?' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Public navigation' })).toHaveCount(0)
  let accountReloads = 0
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/matchmaking/account') accountReloads++ })
  await page.getByRole('link', { name: 'Community', exact: true }).click()
  await page.getByRole('link', { name: 'Back to Home', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Who’s around?' })).toBeVisible()
  expect(accountReloads).toBe(0)
  await page.route('**/api/matchmaking/account', route => route.fulfill({ status: 503, json: { error: 'Unavailable' } }))
  await page.goto('/privacy')
  await expect(page.getByRole('heading', { name: 'Privacy Policy', exact: true })).toBeVisible()
})
