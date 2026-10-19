import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const R = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots'
const user = 'qa-auth-2@example.com'
const { page, problems, close } = await openAs(user, { width: 390, height: 844 })
const log = (...a) => console.log(...a)
const state = async label => log(label, page.url(), '|', (await page.locator('h1, h2').allInnerTexts()).join(' / '), '|', (await page.locator('.pt-step-row').innerText().catch(() => '')).replace('\n', ' '), '| alerts:', (await page.locator('[role=alert]').allInnerTexts()).join(' // '))
await page.goto('/onboarding?returnTo=%2Fevents'); await page.waitForTimeout(1500)
const skip = page.getByRole('button', { name: 'Skip animation' }); if (await skip.count()) { await skip.click(); await page.waitForTimeout(600) }
await state('start')
await page.getByRole('button', { name: 'Music' }).click()
await page.getByRole('button', { name: 'Coffee' }).click()
// fail the save
await page.route('**/api/matchmaking/account', route => route.request().method() === 'PUT' ? route.abort() : route.continue())
await page.getByRole('button', { name: /Complete chapter/ }).click()
await page.waitForTimeout(1500)
await state('after failed save')
await page.screenshot({ path: `${R}/AUTH-onboarding-save-failed-390.png`, fullPage: true })
log('pressed:', await page.locator('[aria-pressed=true]').allInnerTexts())
// 500 response
await page.unroute('**/api/matchmaking/account')
await page.route('**/api/matchmaking/account', route => route.request().method() === 'PUT' ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom internal' }) }) : route.continue())
await page.getByRole('button', { name: /Complete chapter/ }).click()
await page.waitForTimeout(1500)
await state('after 500 save')
await page.screenshot({ path: `${R}/AUTH-onboarding-save-500-390.png`, fullPage: true })
await page.unroute('**/api/matchmaking/account')
await page.getByRole('button', { name: /Complete chapter/ }).click()
await page.waitForTimeout(2500)
await state('after real save')
log(problems.join('\n'))
await close()
