import { expect, test } from '@playwright/test'

test('marketing animates without a manual control and respects reduced motion', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: /Pause motion|Resume motion|Motion reduced/ })).toHaveCount(0)
  const arrival = page.locator('.marketing-arrival-one')
  const position = () => arrival.evaluate(element => getComputedStyle(element).transform)
  const start = await position()
  await expect.poll(position).not.toBe(start)
  await page.locator('.marketing-community-media').scrollIntoViewIfNeeded()
  await expect(page.locator('.marketing-community-media')).toHaveAttribute('data-visible', 'true')
  await expect(page.locator('.marketing-community-media')).toHaveAttribute('data-media', 'illustration')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await page.locator('.public-marketing').evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0)
  for (const selector of ['.marketing-build-loop', '.marketing-build-nature', '.marketing-build-home', '.marketing-build-friends']) {
    expect(await page.locator(selector).first().evaluate(element => getComputedStyle(element).opacity)).toBe('1')
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.getByRole('heading', { name: 'Find a little time in common.' }).scrollIntoViewIfNeeded()
  const resumed = await position()
  await expect.poll(position).not.toBe(resumed)
  await expect(page.locator('.marketing-community-media')).toHaveAttribute('data-visible', 'false')
  expect(await page.locator('.marketing-build-loop').evaluate(element => getComputedStyle(element).animationPlayState)).toBe('paused')
})
