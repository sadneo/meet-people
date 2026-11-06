import { expect, test } from '@playwright/test'
import { conversationId, wiringFixture } from './wiring-fixture'

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
  test(`lost acknowledgement stays a same-ID retry after navigation at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    const fixture = await wiringFixture(page, { lostMessage: true })
    await page.goto(`/messages/chat?conversation=${conversationId}`)
    const composer = page.getByRole('textbox', { name: 'Message', exact: true })
    await composer.fill('Navigation-safe retry')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Retry same message' })).toBeEnabled()
    await page.getByRole('link', { name: 'Back to conversations' }).click()
    await page.getByRole('link', { name: /Taylor/ }).click()
    await expect(page.getByRole('button', { name: 'Retry same message' })).toBeEnabled()
    await expect(composer).toHaveValue('Navigation-safe retry')
    if (process.env.QA_EVIDENCE_DIR) await page.screenshot({ path: `${process.env.QA_EVIDENCE_DIR}/MSG-01-${viewport.width}-retry.png`, fullPage: true })
    await page.getByRole('button', { name: 'Retry same message' }).click()
    await expect(composer).toHaveValue('')
    await expect(page.getByRole('log').getByText('Navigation-safe retry', { exact: true })).toHaveCount(1)
    expect(fixture.sent.size).toBe(1)
    if (process.env.QA_EVIDENCE_DIR) await page.screenshot({ path: `${process.env.QA_EVIDENCE_DIR}/MSG-01-${viewport.width}-confirmed.png`, fullPage: true })
  })

  test(`email outage gives actionable safe text at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await wiringFixture(page, { guest: true })
    await page.route('**/api/auth/email', route => route.fulfill({ status: 503, json: { code: 'unavailable', error: 'Private diagnostic' } }))
    await page.goto('/login')
    await page.getByRole('textbox', { name: /email/i }).fill('qa@example.test')
    await page.getByRole('button', { name: 'Continue with email' }).click()
    await expect(page.getByRole('alert')).toHaveText('Email checking is temporarily unavailable. Please try again shortly.')
    if (process.env.QA_EVIDENCE_DIR) await page.screenshot({ path: `${process.env.QA_EVIDENCE_DIR}/AUTH-01-${viewport.width}.png`, fullPage: true })
    await page.route('**/api/auth/email', route => route.fulfill({ json: { exists: true } }))
    await page.getByRole('button', { name: 'Continue with email' }).click()
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
  })
}
