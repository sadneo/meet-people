import { expect, test, type Page } from '@playwright/test'
import { eventId, wiringFixture } from './wiring-fixture'
import { mockLocationPicker } from './location-picker-fixture'

async function identity(page: Page) {
  await page.getByLabel('Display name').fill('Jamie')
  await page.getByLabel('Username').fill('jamie')
  await page.getByLabel('Month', { exact: true }).fill('1')
  await page.getByLabel('Day', { exact: true }).fill('2')
  await page.getByLabel('Year', { exact: true }).fill('2001')
}
const submit = (page: Page) => page.getByRole('button', { name: 'Enter Pebble', exact: true }).click()

for (const width of [320, 390, 1280]) {
  test(`basic onboarding opens the requested page with one save at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width <= 390 ? 640 : 900 })
    const fixture = await wiringFixture(page, { fresh: true })
    await page.goto('/events')
    await expect(page.getByRole('heading', { name: 'Create your profile' })).toBeVisible()
    await expect(page.getByText('The name people see.')).toBeVisible()
    await expect(page.getByText('Your unique @handle.')).toBeVisible()
    await expect(page.getByLabel('Username')).toBeEmpty()
    await expect(page.getByLabel(/city|campus|availability/i)).toHaveCount(0)
    await identity(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: test.info().outputPath(`basic-onboarding-${width}.png`), fullPage: true })
    await submit(page)
    await expect(page).toHaveURL(/\/events$/)
    expect(fixture.getAccount().profile).toMatchObject({
      username: 'jamie', display_name: 'Jamie', birthdate: '2001-01-02',
      location_city: null, interests: [], availability: [],
    })
    const writes = fixture.calls.filter(call => call.method === 'PUT')
    expect(writes).toHaveLength(1)
    const deviceZone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
    expect(writes[0].body).toMatchObject({ initialTimeZone: deviceZone })
    await page.reload()
    await expect(page).toHaveURL(/\/events$/)
  })
}

test('an unconfirmed basic save keeps the draft and requires a readback', async ({ page }) => {
  const fixture = await wiringFixture(page, { fresh: true })
  let stored = fixture.getAccount(), writes = 0
  await page.route('**/api/matchmaking/account', route => {
    if (route.request().method() === 'PUT') {
      writes++; stored = route.request().postDataJSON(); delete (stored as typeof stored & { initialTimeZone?: string }).initialTimeZone
      return route.abort()
    }
    return route.fulfill({ json: stored })
  })
  await page.goto('/events')
  await identity(page)
  await submit(page)
  await expect(page.getByRole('alert')).toContainText('Account save could not be confirmed')
  await expect(page.getByLabel('Display name')).toHaveValue('Jamie')
  await expect(page.getByRole('button', { name: 'Enter Pebble' })).toBeDisabled()
  await page.getByRole('button', { name: 'Reload saved profile' }).click()
  await expect(page).toHaveURL(/\/events$/)
  expect(writes).toBe(1)
})

test('validates the birthday and lets the user correct a taken username', async ({ page }) => {
  const fixture = await wiringFixture(page, { fresh: true })
  await page.route('**/api/matchmaking/account', route =>
    route.request().method() === 'PUT' && route.request().postDataJSON().profile.username === 'jamie'
      ? route.fulfill({ status: 400, json: { code: 'invalid', error: 'That username is already taken. Choose another.' } })
      : route.fallback())
  await page.goto('/events')
  await identity(page)
  await page.getByLabel('Month', { exact: true }).fill('2')
  await page.getByLabel('Day', { exact: true }).fill('31')
  await submit(page)
  await expect(page.getByRole('alert')).toHaveText('Enter a valid birthday.')
  await page.getByLabel('Day', { exact: true }).fill('28')
  await submit(page)
  await expect(page.getByRole('alert')).toHaveText('That username is already taken. Choose another.')
  await page.getByLabel('Username').fill('jamie_p')
  await submit(page)
  await expect(page).toHaveURL(/\/events$/)
  expect(fixture.getAccount().profile?.username).toBe('jamie_p')
})

async function confirmArea(page: Page) {
  await page.getByRole('button', { name: /Search area Choose an area/ }).click()
  await page.getByRole('combobox', { name: 'Search city or neighborhood' }).fill('Brooklyn')
  await page.getByRole('button', { name: 'Brooklyn, NY', exact: true }).click()
  await page.getByRole('button', { name: 'Set search area', exact: true }).click()
  await expect(page.getByRole('button', { name: /Search area Brooklyn, NY/ })).toBeVisible()
}

test('shared matching setup carries forward while Friends and Dating start independently', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 })
  const fixture = await wiringFixture(page, { fresh: true })
  const { calls: mapCalls } = await mockLocationPicker(page)
  await page.goto('/matchmaking')
  await identity(page)
  await submit(page)
  await page.getByRole('button', { name: 'Set up Friends', exact: true }).click()
  const friends = page.getByRole('dialog', { name: 'Set up Friends matchmaking' })
  await friends.getByRole('button', { name: 'Save and continue' }).click()
  await expect(friends.getByRole('alert')).toHaveText('Choose at least one interest.')
  await friends.getByRole('button', { name: 'Coffee', exact: true }).click()
  await friends.getByRole('button', { name: 'Save and continue' }).click()
  await expect(friends.getByRole('alert')).toHaveText('Upload a profile photo to continue.')
  const photoPanel = friends.getByRole('region', { name: 'Your photo' })
  const portrait = photoPanel.locator('.matching-photo-portrait')
  async function expectSameBottom(first: typeof portrait, second: typeof portrait) {
    const [a, b] = await Promise.all([first.boundingBox(), second.boundingBox()])
    expect(Math.abs(a!.y + a!.height - b!.y - b!.height)).toBeLessThan(1)
  }
  await expectSameBottom(portrait, photoPanel.getByRole('button', { name: 'Add photo' }))
  await expectSameBottom(friends.getByLabel('Custom interest'), friends.getByRole('button', { name: 'Add', exact: true }))
  const [picker] = await Promise.all([
    page.waitForEvent('filechooser'),
    friends.getByRole('button', { name: 'Add photo', exact: true }).click(),
  ])
  await picker.setFiles({
    name: 'profile.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf1sAAAAASUVORK5CYII=', 'base64'),
  })
  await expect(friends.getByRole('button', { name: 'Choose another' })).toBeVisible()
  await expectSameBottom(portrait, photoPanel.getByRole('button', { name: 'Choose another' }))
  await friends.getByRole('button', { name: 'Upload photo' }).click()
  await expect(friends.getByRole('button', { name: 'Change photo' })).toBeEnabled()
  await expect(friends.getByRole('img', { name: 'Jamie' })).toBeVisible()
  await friends.getByRole('button', { name: 'Save and continue' }).click()
  await expect(friends.getByRole('heading', { name: 'Choose your search area' })).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('friends-setup-mobile.png') })
  await confirmArea(page)
  expect(fixture.calls.some(call => call.path.endsWith('/friends/start'))).toBe(false)
  await friends.getByRole('button', { name: 'Save and start Friends' }).click()
  await expect(friends).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Connect', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Dating', exact: true }).click()
  await page.getByRole('button', { name: 'Set up Dating', exact: true }).click()
  const dating = page.getByRole('dialog', { name: 'Set up Dating' })
  await expect(dating.getByRole('heading', { name: 'Your matching profile' })).toHaveCount(0)
  await dating.getByRole('combobox', { name: 'Gender', exact: true }).selectOption('Man')
  await dating.getByRole('combobox', { name: 'Sexuality', exact: true }).selectOption('Straight')
  await dating.getByLabel('Looking for').selectOption('Long-term relationship')
  await dating.getByLabel('Relationship style').selectOption('Monogamy')
  await confirmArea(page)
  await dating.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(dating.getByRole('button', { name: 'Save and start Dating' })).toBeVisible()
  expect(fixture.calls.some(call => call.path.endsWith('/dating/enabled'))).toBe(false)
  await dating.getByRole('button', { name: 'Save and start Dating' }).click()
  await expect(dating).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Pause Dating', exact: true })).toBeVisible()
  expect(fixture.getAccount().profile?.availability).toEqual([])
  expect(mapCalls.filter(call => call.path.endsWith('/map/confirm')).map(call => call.body.mode)).toEqual(['friends', 'dating'])
})

test('event matching prompts beside the queue and group matching requires a saved time', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.clock.install({ time: new Date('2026-11-03T12:00:00Z') })
  const fixture = await wiringFixture(page)
  let groupScheduleReady = false, areaReady = false
  await page.route('**/api/matchmaking/friends/setup', route => route.fulfill({
    json: { profileReady: true, friendsAreaReady: areaReady, groupScheduleReady },
  }))
  await page.goto(`/events/${eventId}`)
  await expect(page.getByRole('button', { name: 'Join group queue' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Set up event matching' }).click()
  const event = page.getByRole('dialog', { name: 'Set up event matching' })
  await expect(event.getByRole('heading', { name: 'Choose your search area' })).toBeVisible()
  await event.getByRole('button', { name: 'Close' }).click()

  areaReady = true
  fixture.getAccount().profile!.availability = []
  await page.goto('/messages')
  await page.getByRole('button', { name: 'Find a group', exact: true }).click()
  const group = page.getByRole('dialog', { name: 'Find a group' })
  await group.getByRole('button', { name: 'Set up group matching' }).click()
  await expect(group.getByRole('heading', { name: 'When can you meet?' })).toBeVisible()
  await group.getByRole('button', { name: 'Save and continue' }).click()
  await expect(group.getByRole('alert')).toHaveText('Choose at least one hour when you can meet.')
  await group.getByRole('button', { name: 'Add a time window' }).click()
  for (const name of ['Ends at midnight', 'Allow shared-time explanations']) {
    const distance = await group.getByRole('checkbox', { name, exact: true }).evaluate(input => {
      const box = input.getBoundingClientRect()
      const copy = input.closest('label')!.querySelector('span')!.getBoundingClientRect()
      return Math.abs(box.top + box.height / 2 - copy.top - copy.height / 2)
    })
    expect(distance).toBeLessThan(2)
  }
  groupScheduleReady = true
  await group.getByRole('button', { name: 'Save and continue' }).click()
  await group.getByRole('button', { name: 'Finish setup' }).click()
  await expect(group.getByRole('button', { name: 'Find a group', exact: true })).toBeEnabled()
  expect(fixture.calls.filter(call => call.method === 'POST' &&
    /\/(friends\/start|active-friends\/queue|group-queue)$/.test(call.path))).toHaveLength(0)
})
