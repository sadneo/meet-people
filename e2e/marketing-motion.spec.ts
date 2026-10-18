import { expect, test } from '@playwright/test'

test('marketing motion can pause, resume, and respond to reduced motion', async ({ page }) => {
  await page.goto('/')
  const arrival = page.locator('.marketing-arrival-one')
  const position = () => arrival.evaluate(element => getComputedStyle(element).transform)
  const start = await position()
  await expect.poll(position).not.toBe(start)
  await page.getByRole('button', { name: 'Pause motion', exact: true }).click()
  const stopped = await position()
  await page.waitForTimeout(350)
  expect(await position()).toBe(stopped)
  await expect(page.getByRole('button', { name: 'Resume motion', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Resume motion', exact: true }).click()
  await expect.poll(position).not.toBe(stopped)
  await page.locator('.marketing-community-media').scrollIntoViewIfNeeded()
  await expect(page.locator('.marketing-community-media')).toHaveAttribute('data-visible', 'true')
  await expect(page.locator('.marketing-community-media')).toHaveAttribute('data-media', 'illustration')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.getByRole('button', { name: 'Motion reduced', exact: true })).toBeDisabled()
  expect(await page.locator('.public-marketing').evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0)
  for (const selector of ['.marketing-build-loop', '.marketing-build-nature', '.marketing-build-home', '.marketing-build-friends']) {
    expect(await page.locator(selector).first().evaluate(element => getComputedStyle(element).opacity)).toBe('1')
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.getByRole('heading', { name: 'Find a little time in common.' }).scrollIntoViewIfNeeded()
  await expect(page.locator('.marketing-community-media')).toHaveAttribute('data-visible', 'false')
  expect(await page.locator('.marketing-build-loop').evaluate(element => getComputedStyle(element).animationPlayState)).toBe('paused')
})
