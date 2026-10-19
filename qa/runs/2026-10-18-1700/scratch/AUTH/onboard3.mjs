import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const R = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots'
const user = 'qa-auth-2@example.com'
const { page, problems, close } = await openAs(user, { width: 1280, height: 860 })
const log = (...a) => console.log(...a)
const state = async label => log(label, page.url(), '|', (await page.locator('h1, h2').allInnerTexts()).join(' / '), '|', (await page.locator('.pt-step-row').innerText().catch(() => '')).replace('\n', ' '), '| alerts:', (await page.locator('[role=alert]').allInnerTexts()).join(' // '))
await page.goto('/onboarding?returnTo=%2Fevents'); await page.waitForTimeout(1500)
const skip = page.getByRole('button', { name: 'Skip animation' }); if (await skip.count()) { await skip.click(); await page.waitForTimeout(600) }
await state('start')
await page.screenshot({ path: `${R}/AUTH-onboarding-ch3-1280.png` })
// try clicking a completed stone (chapter 1) to go back & check values persisted
await page.getByRole('button', { name: 'Basic profile, completed' }).click(); await page.waitForTimeout(500)
await state('stone 1')
log('name:', await page.getByLabel('Display name').inputValue(), '| bio:', await page.getByLabel('A short bio').inputValue())
await page.getByRole('button', { name: 'Interests, completed' }).click(); await page.waitForTimeout(500)
log('interests pressed:', await page.locator('.pt-chapter-form [aria-pressed=true]').allInnerTexts())
await page.getByRole('button', { name: /^Social intent/ }).first().click(); await page.waitForTimeout(500)
await state('ch3')
const chips = page.locator('.pt-chapter-form .pt-chips button')
log('intent options:', await chips.allInnerTexts())
await chips.first().click()
await page.getByRole('button', { name: /Complete chapter/ }).click(); await page.waitForTimeout(2500)
await state('ch4')
await page.screenshot({ path: `${R}/AUTH-onboarding-ch4-1280.png` })
await page.getByRole('button', { name: 'Weekends' }).click()
await page.getByRole('button', { name: /Complete chapter/ }).click(); await page.waitForTimeout(3500)
await state('after ch4')
await page.screenshot({ path: `${R}/AUTH-onboarding-ending-1280.png` })
const enter = page.getByRole('button', { name: 'Enter Pebble' })
if (await enter.count()) { await enter.click(); await page.waitForTimeout(2000); await state('entered') }
await page.screenshot({ path: `${R}/AUTH-onboarding-entered-1280.png` })
await page.goBack(); await page.waitForTimeout(1500); await state('back after enter')
log(problems.join('\n'))
await close()
