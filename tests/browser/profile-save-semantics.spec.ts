import { expect, test } from '@playwright/test'
import { wiringFixture } from './wiring-fixture'

const image = { name: 'avatar.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aElcAAAAASUVORK5CYII=', 'base64') }

test('photo selection and removal obey Profile Save changes and Cancel', async ({ page }) => {
  const fixture = await wiringFixture(page)
  const writes = () => fixture.calls.filter(call => call.path.endsWith('/profile-photo') && ['PUT', 'DELETE'].includes(call.method))
  await page.goto('/profile?section=basics')
  await page.getByLabel('Choose a photo').setInputFiles(image)
  await expect(page.getByText('Photo selection will be saved with Save changes.')).toBeVisible()
  expect(writes()).toHaveLength(0)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Remove photo', exact: true })).toHaveCount(0)
  expect(writes()).toHaveLength(0)

  await page.getByLabel('Choose a photo').setInputFiles(image)
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Edit profile', exact: true })).toBeVisible()
  expect(writes()).toHaveLength(1)
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click()
  await page.getByRole('button', { name: 'Remove photo', exact: true }).click()
  await expect(page.getByText('Photo removal will be saved with Save changes.')).toBeVisible()
  expect(writes()).toHaveLength(1)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Remove photo', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Remove photo', exact: true }).click()
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Edit profile', exact: true })).toBeVisible()
  expect(writes()).toHaveLength(2)
  await page.reload()
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Remove photo', exact: true })).toHaveCount(0)
})

test('Privacy and the profile editor share one canonical availability opt-in without copying legacy consent', async ({ page }) => {
  const fixture = await wiringFixture(page)
  let schedule = { revision: 1, timeZone: 'America/New_York', showAvailability: false }
  let writes = 0
  await page.route('**/api/matchmaking/schedule', route => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON()
      expect(body.expectedRevision).toBe(schedule.revision)
      schedule = { revision: schedule.revision + 1, timeZone: body.timeZone, showAvailability: body.showAvailability }
      writes++
    }
    return route.fulfill({ json: schedule })
  })
  await page.goto('/profile?section=privacy')
  await page.getByText('Timezone & shared availability', { exact: true }).click()
  const sharing = page.getByRole('checkbox', { name: 'Allow shared-time explanations', exact: true })
  await expect(sharing).toBeEnabled()
  await expect(sharing).not.toBeChecked()
  expect(writes).toBe(0)
  await sharing.check()
  expect(writes).toBe(0)
  await page.getByRole('button', { name: 'Save timezone & sharing', exact: true }).click()
  await expect(page.getByText('Timezone and sharing preference saved.')).toBeVisible()
  await page.goto('/profile?section=interests')
  await expect(sharing).toBeChecked()
  await sharing.uncheck()
  await expect(page.getByText('Timezone and sharing preference saved.')).toBeVisible()
  expect(writes).toBe(2)
  await page.goto('/profile?section=privacy')
  await page.getByText('Timezone & shared availability', { exact: true }).click()
  await expect(sharing).toBeEnabled()
  await expect(sharing).not.toBeChecked()
  expect(fixture.getAccount().settings.availability).toBe(true)
  expect(schedule.showAvailability).toBe(false)
})
