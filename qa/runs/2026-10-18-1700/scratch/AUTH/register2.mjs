import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const R = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots'
const email = process.argv[2] ?? 'qa-auth-2@example.com'
const returnTo = process.argv[3] ?? '/events'
const { page, problems, close } = await openAs('guest', { width: 390, height: 844 })
const log = (...a) => console.log(...a)
await page.goto('/login'); await page.waitForTimeout(500)
await page.evaluate(([email, returnTo]) => history.replaceState({ usr: { authStep: 'register', email }, key: 'qa', idx: 0 }, '', `/login?returnTo=${encodeURIComponent(returnTo)}`), [email, returnTo])
await page.reload(); await page.waitForTimeout(1000)
log('step:', await page.locator('h1').innerText())
await page.getByLabel('Password', { exact: true }).fill('password123')
await page.getByLabel('Confirm password').fill('password123')
await page.getByRole('button', { name: 'Create account' }).click()
for (let i = 0; i < 8; i++) { await page.waitForTimeout(700); log(i, page.url(), '|', await page.locator('h1, h2').allInnerTexts().catch(() => '')) ; if (i === 1) await page.screenshot({ path: `${R}/AUTH-register2-transition-390.png` }) }
await page.screenshot({ path: `${R}/AUTH-register2-after-create-390.png` })
log(problems.join('\n'))
await close()
