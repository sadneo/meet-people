import { expect, test } from '@playwright/test'
import { mockMatchingSession } from './matchmaking-fixture'

const documents = [
  ['/terms', 'Terms of Service'],
  ['/privacy', 'Privacy Policy'],
  ['/cookies', 'Cookie Policy'],
] as const

for (const width of [320, 390, 1280]) {
  for (const [path, title] of documents) {
    test(`${title} is public, readable and keyboard accessible at ${width}px`, async ({ page }, testInfo) => {
      await mockMatchingSession(page, false)
      await page.setViewportSize({ width, height: 900 })
      const privateRequests: string[] = []
      await page.route('**/api/**', route => { privateRequests.push(route.request().url()); return route.abort() })
      await page.goto(path)
      await expect(page).toHaveURL(path)
      await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible()
      const nav = page.getByRole('navigation', { name: 'Legal documents' })
      await expect(nav.getByRole('link', { name: title, exact: true })).toHaveAttribute('aria-current', 'page')
      for (const [destination, label] of documents) {
        await expect(page.getByRole('navigation', { name: 'Footer navigation' }).getByRole('link', { name: label, exact: true })).toHaveAttribute('href', destination)
      }
      const copy = page.locator('.legal-copy')
      await expect(copy).toContainText('Pebble development team')
      expect(await copy.innerText()).not.toMatch(/TO BE CONFIRMED|Messaging currently shows sample|delivery to other accounts is not yet available/)
      const email = copy.getByRole('link', { name: 'pebblesupport.help@gmail.com', exact: true })
      await expect(email).toHaveAttribute('href', 'mailto:pebblesupport.help@gmail.com')
      await page.getByRole('link', { name: 'Skip to content' }).focus()
      await page.keyboard.press('Enter')
      await expect(page.getByRole('main')).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(nav.getByRole('link', { name: 'Terms of Service', exact: true })).toBeFocused()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      const readable = await copy.locator('p, h1, h2, a').evaluateAll(elements => elements.every(element => {
        const rect = element.getBoundingClientRect()
        return rect.left >= 0 && rect.right <= innerWidth + 1 && Number.parseFloat(getComputedStyle(element).fontSize) >= 14
      }))
      expect(readable).toBe(true)
      expect(privateRequests).toEqual([])
      await page.screenshot({ path: testInfo.outputPath(`${path.slice(1)}-${width}.png`), fullPage: true })
      await email.scrollIntoViewIfNeeded()
      await page.screenshot({ path: testInfo.outputPath(`${path.slice(1)}-${width}-contact.png`) })
    })
  }
}

test('cookie information neither creates consent records nor clears functional storage', async ({ page }) => {
  await mockMatchingSession(page, false)
  await page.goto('/cookies')
  const before = await page.evaluate(() => ({ storage: { ...localStorage }, cookie: document.cookie }))
  await expect(page.getByRole('heading', { name: 'Manage browser storage', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /accept|reject|consent|clear/i })).toHaveCount(0)
  await page.getByRole('navigation', { name: 'Legal documents' }).getByRole('link', { name: 'Privacy Policy', exact: true }).click()
  await expect(page).toHaveURL('/privacy')
  await page.getByRole('navigation', { name: 'Legal documents' }).getByRole('link', { name: 'Cookie Policy', exact: true }).click()
  await page.reload()
  expect(await page.evaluate(() => ({ storage: { ...localStorage }, cookie: document.cookie }))).toEqual(before)
})

test('signed-in visitors can read every policy even when account services fail', async ({ page }) => {
  await mockMatchingSession(page)
  const requests: string[] = []
  await page.route('**/api/**', route => {
    requests.push(route.request().url())
    return route.fulfill({ status: 503, json: { error: 'Unavailable' } })
  })
  for (const [path, title] of documents) {
    await page.goto(path)
    await expect(page).toHaveURL(path)
    await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible()
  }
  expect(requests).toEqual([])
})
