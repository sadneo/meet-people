import { expect, test } from '@playwright/test'
import { wiringFixture } from './wiring-fixture'

test('recent Garden revisits stay usable without waiting for a redundant API read', async ({ page }) => {
  const fixture = await wiringFixture(page)
  let hold = false, release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/garden', async route => {
    if (hold) await held
    else await new Promise(resolve => setTimeout(resolve, 250))
    await route.fallback()
  })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Open Garden inventory', exact: true })).toBeEnabled()
  const reads = fixture.garden.calls.filter(call => call.method === 'GET').length
  expect(reads).toBe(1)
  const nav = page.getByRole('navigation', { name: 'Main navigation' })
  await nav.getByRole('link', { name: 'Events', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Events', exact: true })).toBeVisible()
  hold = true
  try {
    await nav.getByRole('link', { name: 'Garden', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Open Garden inventory', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: 'Open Garden inventory', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Your garden', exact: true })).toBeVisible()
    expect(fixture.garden.calls.filter(call => call.method === 'GET')).toHaveLength(reads)
    expect(fixture.garden.calls.filter(call => call.method === 'POST')).toHaveLength(0)
  } finally { release() }
})

test('a cached Garden still waits for current server state and confirmation before a purchase is saved', async ({ page }) => {
  const fixture = await wiringFixture(page)
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Open Garden inventory', exact: true })).toBeEnabled()
  let release!: () => void, heldRead = false
  const held = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/garden', async route => {
    if (route.request().method() === 'GET') { heldRead = true; await held }
    await route.fallback()
  })
  await page.getByRole('button', { name: 'Open Garden inventory', exact: true }).click()
  await page.getByLabel('Decorations', { exact: true }).click()
  try {
    await page.locator('.garden-shop-item').filter({ has: page.getByText('Garden Bench', { exact: true }) }).getByRole('button', { name: 'Build', exact: true }).click()
    await expect.poll(() => heldRead).toBe(true)
    expect(fixture.garden.calls.filter(call => call.method === 'POST')).toHaveLength(0)
    expect(fixture.garden.read().owned).not.toContain('bench')
    await expect(page.getByRole('dialog', { name: 'Your garden', exact: true })).toBeVisible()
    await expect(page.locator('.garden-build-footer small')).toContainText('Syncing')
  } finally { release() }
  await expect(page.getByRole('dialog', { name: 'Your garden', exact: true })).not.toBeVisible()
  expect(fixture.garden.calls.filter(call => call.method === 'POST')).toHaveLength(1)
  expect(fixture.garden.read()).toMatchObject({ balance: 285, owned: ['bench'] })
})
