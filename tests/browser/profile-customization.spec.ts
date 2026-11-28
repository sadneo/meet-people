import { expect, test } from '@playwright/test'
import { peer, wiringFixture } from './wiring-fixture'

test('a top interest is saved with the profile and leads the preview', async ({ page }) => {
  const fixture = await wiringFixture(page)
  await page.goto('/profile?section=interests')
  await page.getByRole('button', { name: 'Make Music your top interest' }).click()
  await expect(page.getByText('Unsaved changes')).toBeVisible()
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Edit profile', exact: true })).toBeVisible()
  expect(fixture.getCustomization().customization.interestOrder[0]).toBe('Music')
  await page.getByRole('group', { name: 'Profile view' }).getByRole('button', { name: 'Preview', exact: true }).click()
  const preview = page.getByRole('region', { name: 'How others see your profile' })
  await expect(preview.locator('.dating-interest').first()).toHaveText('Music')
  await expect(preview.locator('.dating-interest.is-top')).toHaveCount(1)
})

test('details can be limited to one mode and a Garden item can be shown', async ({ page }) => {
  const fixture = await wiringFixture(page)
  await page.goto('/profile?section=basics')
  await page.getByLabel('Education (optional)').fill('Biology')
  await page.getByText('Show education', { exact: true }).click()
  await page.getByLabel('Show education to').selectOption('dating')
  await page.getByText('Your Pebble', { exact: true }).click()
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Edit profile', exact: true })).toBeVisible()
  expect(fixture.getCustomization().customization).toMatchObject({ audiences: { education: 'dating' }, gardenItem: 'pebble' })
  await page.getByRole('group', { name: 'Profile view' }).getByRole('button', { name: 'Preview', exact: true }).click()
  const preview = page.getByRole('region', { name: 'How others see your profile' })
  await expect(preview.locator('.card-garden-item')).toBeVisible()
  await expect(preview.getByText('Biology')).toHaveCount(0)
  await preview.getByRole('group', { name: 'Preview as' }).getByRole('button', { name: 'Dating' }).click()
  await expect(preview.getByText('Biology')).toBeVisible()
})

test('the finish card links straight to what is missing', async ({ page }) => {
  await wiringFixture(page)
  await page.goto('/profile')
  const card = page.getByRole('region', { name: 'Finish your profile' })
  await expect(card).toContainText('3 of 5 done')
  await card.getByRole('link', { name: 'Write a short bio' }).click()
  await expect(page).toHaveURL(/section=basics/)
  await expect(page.getByRole('textbox', { name: /^Bio/ })).toBeVisible()
})

test('Discover cards show the person’s top interest and Garden item', async ({ page }) => {
  await wiringFixture(page)
  await page.route(`**/api/matchmaking/profile-customization/${peer}`, route => route.fulfill({ json: { interestOrder: ['Coffee'], gardenItem: 'bench' } }))
  await page.goto('/matchmaking?mode=friends')
  const card = page.locator('.discovery-card-slot:not([hidden])')
  await expect(card.getByRole('img', { name: /^From Taylor's Garden/ })).toBeVisible()
  await expect(card.locator('.dating-interest.is-top')).toContainText('Coffee')
})

test('prompts are answered in the editor, saved, and shown per mode in the preview', async ({ page }) => {
  const fixture = await wiringFixture(page)
  await page.goto('/profile?section=basics')
  await page.getByLabel('Choose a prompt').selectOption('study-spot')
  const answer = page.getByLabel(/Your answer to Best study spot/)
  await answer.fill('Text me at 631-555-0199')
  await expect(page.getByText(/looks like a phone number/)).toBeVisible()
  await answer.fill('Third floor of the library')
  await page.getByLabel('Choose a prompt').selectOption('first-date')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Answer each prompt or remove it.')
  await page.getByLabel(/Your answer to My ideal first date/).fill('Coffee and a walk')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Edit profile', exact: true })).toBeVisible()
  expect(fixture.getCustomization().customization).toMatchObject({ prompts: [{ id: 'study-spot', answer: 'Third floor of the library' }, { id: 'first-date', answer: 'Coffee and a walk' }] })
  await page.getByRole('group', { name: 'Profile view' }).getByRole('button', { name: 'Preview', exact: true }).click()
  const preview = page.getByRole('region', { name: 'How others see your profile' })
  await expect(preview.locator('.prompt-card')).toHaveCount(1)
  await preview.getByRole('group', { name: 'Preview as' }).getByRole('button', { name: 'Dating' }).click()
  await expect(preview.locator('.prompt-card')).toHaveCount(2)
})

test('a Discover card shows prompts and the current photo caption, and nothing when none are set', async ({ page }) => {
  await wiringFixture(page)
  let withPrompts = false
  await page.route(`**/api/matchmaking/profile-customization/${peer}/prompts/*`, route => route.fulfill({ json: { prompts: withPrompts ? [{ id: 'study-spot', answer: 'Library roof' }] : [] } }))
  await page.goto('/matchmaking?mode=friends')
  const card = page.locator('.discovery-card-slot:not([hidden])')
  await expect(card.getByRole('heading', { name: 'Taylor, 23' })).toBeVisible()
  await expect(card.locator('.prompt-card')).toHaveCount(0)
  await expect(card.locator('.photo-caption')).toHaveCount(0)
  withPrompts = true
  await page.reload()
  await expect(page.locator('.discovery-card-slot:not([hidden]) .prompt-card')).toContainText('Library roof')
})

test('prompts can differ between Friends and Dating and Dating can use its own bio', async ({ page }) => {
  const fixture = await wiringFixture(page)
  await page.goto('/profile?section=basics')
  for (const [id, answer] of [['study-spot', 'Library roof'], ['ask-me-about', 'Ramen spots']] as const) {
    await page.getByLabel('Choose a prompt').selectOption(id)
    await page.getByLabel(new RegExp(`Your answer to ${id === 'study-spot' ? 'Best study spot' : 'Ask me about'}`)).fill(answer)
  }
  // Show the study spot only in Friends.
  await page.getByRole('group', { name: /^Show “Best study spot/ }).getByRole('button', { name: 'Dating' }).click()
  await expect(page.getByText('Friends 2/3')).toBeVisible()
  await expect(page.getByText('Dating 1/3')).toBeVisible()
  await page.getByRole('checkbox', { name: 'Use a different bio in Dating' }).check()
  await page.getByRole('textbox', { name: /^Dating bio/ }).fill('Here for something real.')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Edit profile', exact: true })).toBeVisible()
  expect(fixture.getCustomization().customization).toMatchObject({
    datingBio: 'Here for something real.',
    prompts: [{ id: 'study-spot', answer: 'Library roof', audience: 'friends' }, { id: 'ask-me-about', answer: 'Ramen spots' }],
  })
  await page.getByRole('group', { name: 'Profile view' }).getByRole('button', { name: 'Preview', exact: true }).click()
  const preview = page.getByRole('region', { name: 'How others see your profile' })
  await expect(preview.locator('.prompt-card')).toHaveCount(2)
  await preview.getByRole('group', { name: 'Preview as' }).getByRole('button', { name: 'Dating' }).click()
  await expect(preview.locator('.prompt-card')).toHaveCount(1)
  await expect(preview.getByText('Here for something real.')).toBeVisible()
})
