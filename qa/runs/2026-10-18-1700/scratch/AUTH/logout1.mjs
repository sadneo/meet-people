import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const R = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots'
const user = process.argv[2] ?? 'qa-auth-2@example.com'
const { page, problems, close } = await openAs(user, { width: 1280, height: 860 })
const log = (...a) => console.log(...a)
await page.goto('/profile'); await page.waitForTimeout(2000)
log('h1:', await page.locator('h1').first().innerText())
const header = page.locator('header').first()
log('header buttons:', await page.locator('header button, header a').evaluateAll(els => els.map(e => `${e.tagName}:${e.getAttribute('aria-label') ?? e.innerText}`)))
// account menu
const acct = page.getByRole('button', { name: /account|profile menu|Account/i }).first()
log('acct count', await acct.count(), await acct.getAttribute('aria-label').catch(() => ''))
await acct.click(); await page.waitForTimeout(500)
await page.screenshot({ path: `${R}/AUTH-account-menu-1280.png` })
log('menu:', await page.locator('[role=menu], .pt-account-menu').first().ariaSnapshot().catch(() => 'no menu role'))
const out = page.getByRole('menuitem', { name: /Log out/ }).or(page.getByRole('button', { name: /Log out/ })).first()
await out.click(); await page.waitForTimeout(2500)
log('after logout:', page.url(), await page.locator('h1').first().innerText().catch(() => ''))
log('localStorage keys:', await page.evaluate(() => Object.keys(localStorage)))
await page.goBack(); await page.waitForTimeout(2000)
log('back after logout:', page.url(), await page.locator('h1').first().innerText().catch(() => ''))
await page.screenshot({ path: `${R}/AUTH-back-after-logout-1280.png` })
for (const p of ['/settings', '/onboarding', '/matchmaking', '/messages']) { await page.goto(p); await page.waitForTimeout(1800); log(p, '->', page.url(), '|', (await page.locator('h1, h2').allInnerTexts()).slice(0, 3).join(' / '), '| has QA name:', (await page.content()).includes('Maximilian')) }
log(problems.join('\n'))
await close()
