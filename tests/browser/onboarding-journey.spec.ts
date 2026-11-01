import { expect, test, type Page } from '@playwright/test'
import { wiringFixture } from './wiring-fixture'

async function identity(page: Page) {
  await page.getByLabel('Display name', { exact: true }).fill('Jamie')
  await page.getByLabel('Username', { exact: true }).fill('jamie')
  await page.getByLabel('Birthdate · private').fill('2001-01-02')
  await page.getByLabel('City or campus area', { exact: true }).fill('Stony Brook')
}
const continueChapter = (page: Page) => page.getByRole('button', { name: 'Save & continue', exact: true }).click()
const fits = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

for (const width of [320, 1280]) {
  test(`the restored stone journey saves and resumes real chapters at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 640 : 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const fixture = await wiringFixture(page, { fresh: true })
    let schedule = { revision: 0, timeZone: null as string | null, showAvailability: false }
    await page.route('**/api/matchmaking/schedule', route => {
      if (route.request().method() === 'PUT') {
        const input = route.request().postDataJSON()
        schedule = { revision: schedule.revision + 1, timeZone: input.timeZone, showAvailability: input.showAvailability }
      }
      return route.fulfill({ json: schedule })
    })
    await page.goto('/events')
    await expect(page.getByRole('heading', { name: 'A little beginning.' })).toBeVisible()
    await fits(page)
    await page.screenshot({ path: `/tmp/pebble-onboarding-opening-${width}.png`, fullPage: true })
    await page.getByRole('button', { name: 'Start my profile' }).click()
    await expect(page.getByRole('button', { name: 'Your week', exact: true })).toBeDisabled()
    await identity(page)
    await page.screenshot({ path: `/tmp/pebble-onboarding-basics-${width}.png`, fullPage: true })
    await fits(page)
    await continueChapter(page)
    await expect(page.getByText('1 of 4 pieces saved', { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Your kind of things.' })).toBeVisible()
    await expect(page.getByLabel('Onboarding progress').locator('[aria-current=step]')).toContainText('Your interests')
    for (const label of ['Coffee', 'Art', 'Music']) await page.getByRole('button', { name: label, exact: true }).click()
    await fits(page)
    await page.screenshot({ path: `/tmp/pebble-onboarding-interests-${width}.png`, fullPage: true })
    await continueChapter(page)
    await page.getByRole('checkbox', { name: /^Make friends/ }).check()
    await page.getByRole('checkbox', { name: /^Go to events together/ }).check()
    await page.getByRole('checkbox', { name: /^Explore Dating/ }).check()
    await fits(page)
    await page.screenshot({ path: `/tmp/pebble-onboarding-intentions-${width}.png`, fullPage: true })
    await continueChapter(page)
    await page.getByRole('combobox', { name: 'Comfortable distance', exact: true }).selectOption('5 miles')
    await page.getByRole('combobox', { name: 'Group preference', exact: true }).selectOption('Either')
    await page.getByRole('button', { name: 'Add a time window' }).click()
    await expect(page.getByRole('button', { name: 'Finish setup' })).toBeEnabled()
    await page.getByRole('button', { name: 'Finish setup' }).click()
    await expect(page.getByRole('alert')).toContainText('Choose a timezone')
    expect(fixture.getAccount().completed).toEqual([0, 1, 2])
    await page.getByRole('combobox', { name: 'Timezone', exact: true }).selectOption('America/New_York')
    await expect(page.getByText('Weekly timezone saved.', { exact: true })).toBeVisible()
    await fits(page)
    await page.screenshot({ path: `/tmp/pebble-onboarding-week-${width}.png`, fullPage: true })
    await page.getByRole('button', { name: 'Finish setup' }).click()
    await expect(page.getByRole('heading', { name: 'Your Pebble is ready.' })).toBeVisible()
    await page.screenshot({ path: `/tmp/pebble-onboarding-ending-${width}.png`, fullPage: true })
    await fits(page)
    expect(fixture.getAccount().completed).toEqual([0, 1, 2, 3])
    expect(fixture.getAccount().preferences.intents).toEqual(['Make friends', 'Go to events together', 'Date'])
    expect(schedule).toEqual({ revision: 1, timeZone: 'America/New_York', showAvailability: false })
    expect(fixture.calls.filter(call => call.method !== 'GET').every(call => call.path === '/api/matchmaking/account')).toBe(true)
    await page.getByRole('link', { name: 'Enter Pebble' }).click()
    await expect(page).toHaveURL(/\/events$/)
  })
}

test('an unconfirmed chapter save keeps the draft and requires reconciliation before advancing', async ({ page }) => {
  const fixture = await wiringFixture(page, { fresh: true })
  let stored = fixture.getAccount(), writes = 0
  await page.route('**/api/matchmaking/account', route => {
    if (route.request().method() === 'PUT') { writes++; stored = route.request().postDataJSON(); return route.abort() }
    return route.fulfill({ json: stored })
  })
  await page.goto('/onboarding')
  await page.getByRole('button', { name: 'Start my profile' }).click()
  await identity(page)
  await continueChapter(page)
  await expect(page.getByRole('alert')).toContainText('Account save could not be confirmed')
  await expect(page.getByLabel('Display name', { exact: true })).toHaveValue('Jamie')
  await expect(page.getByRole('heading', { name: 'Start with you.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save & continue', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Reload account and replace draft before saving again' }).click()
  await expect(page.getByRole('heading', { name: 'Your kind of things.' })).toBeVisible()
  expect(writes).toBe(1)
})

test('interest limits and empty intent validation use current rules', async ({ page }) => {
  await wiringFixture(page, { incomplete: true })
  await page.goto('/onboarding')
  await continueChapter(page)
  await expect(page.getByRole('alert')).toHaveText('Choose at least 3 interests from the provided list.')
  for (const label of ['Coffee', 'Art', 'Music', 'Gaming', 'Sports']) await page.getByRole('button', { name: label, exact: true }).click()
  await expect(page.getByRole('button', { name: 'Fitness', exact: true })).toBeDisabled()
  await continueChapter(page)
  await continueChapter(page)
  await expect(page.getByRole('alert')).toHaveText('Choose at least one thing you’d like to do.')
  await page.getByRole('checkbox', { name: /^Make friends/ }).check()
  await continueChapter(page)
  // Accounts that started the older onboarding can still supply missing basics.
  await expect(page.getByLabel('Birthdate · private')).toBeVisible()
  await expect(page.getByLabel('City or campus area', { exact: true })).toBeVisible()
})
