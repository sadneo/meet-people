import { openAs, latestEmailLinks } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const R = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots'
const email = process.argv[2] ?? 'qa-auth-1@example.com'
const oldPw = process.argv[3] ?? 'password123', newPw = process.argv[4] ?? 'password456'
const { page, problems, close } = await openAs('guest', { width: 390, height: 844 })
const log = (...a) => console.log(...a)
const txt = async () => (await page.locator('h1, [role=status], [role=alert], #auth-message').allInnerTexts()).join(' / ')
const since = new Date(Date.now() - 2000)
await page.goto('/forgot-password?returnTo=%2Fsettings'); await page.waitForTimeout(800)
await page.getByLabel('Email').fill(email)
await page.getByRole('button', { name: 'Send reset link' }).click(); await page.waitForTimeout(2000)
log('sent:', await txt())
await page.screenshot({ path: `${R}/AUTH-forgot-sent-390.png` })
let links = []
for (let i = 0; i < 10 && !links.length; i++) { await page.waitForTimeout(1000); links = await latestEmailLinks(email, since) }
log('links:', links)
await page.goto(links[0]); await page.waitForTimeout(3000)
log('reset page:', page.url().replace(/access_token=[^&]+/, 'access_token=…').slice(0, 160), '|', await txt())
await page.screenshot({ path: `${R}/AUTH-reset-page-390.png` })
await page.getByLabel('Password', { exact: true }).fill('abcdefgh'); await page.getByLabel('Confirm password').fill('abcdefgx')
await page.getByRole('button', { name: 'Save password' }).click(); await page.waitForTimeout(1000)
log('mismatch:', await txt())
await page.getByLabel('Password', { exact: true }).fill(oldPw); await page.getByLabel('Confirm password').fill(oldPw)
await page.getByRole('button', { name: 'Save password' }).click(); await page.waitForTimeout(2000)
log('same pw:', await txt())
await page.getByLabel('Password', { exact: true }).fill(newPw); await page.getByLabel('Confirm password').fill(newPw)
await page.getByRole('button', { name: 'Save password' }).click(); await page.waitForTimeout(2500)
log('saved:', page.url(), '|', await txt())
await page.screenshot({ path: `${R}/AUTH-reset-done-390.png` })
const cont = page.getByRole('link', { name: 'Continue to Pebble' })
if (await cont.count()) { await cont.click(); await page.waitForTimeout(3000); log('continue ->', page.url(), '|', (await page.locator('h1').allInnerTexts()).join(' / ')) }
// reuse the same link again
await page.goto(links[0]); await page.waitForTimeout(3000)
log('reuse link:', page.url().slice(0, 120), '|', await txt())
await page.screenshot({ path: `${R}/AUTH-reset-link-reused-390.png` })
log(problems.join('\n'))
await close()
