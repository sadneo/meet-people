import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const R = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots'
const user = process.argv[2] ?? 'qa-auth-2@example.com'
const { page, problems, close } = await openAs(user, { width: 390, height: 844 })
const log = (...a) => console.log(...a)
const snap = async () => ({
  sw: await page.getByRole('switch').evaluateAll(els => els.map(e => `${e.getAttribute('aria-label')}=${e.checked}`)),
  distance: await page.getByLabel('Comfortable distance').inputValue().catch(() => 'n/a'),
  group: await page.getByLabel('Group preference').inputValue().catch(() => 'n/a'),
  usual: await page.locator('[aria-label="Usual free time"][role=group] [aria-pressed=true]').allInnerTexts(),
})
await page.goto('/settings'); await page.waitForTimeout(2000)
log('initial', await snap())
await page.getByRole('switch', { name: 'Nearby suggestions' }).click(); await page.waitForTimeout(1200)
await page.getByRole('switch', { name: 'Show me in discovery' }).click(); await page.waitForTimeout(1200)
await page.getByLabel('Comfortable distance').selectOption('10 miles'); await page.waitForTimeout(1200)
await page.getByLabel('Group preference').selectOption('Small groups'); await page.waitForTimeout(1200)
await page.getByRole('button', { name: 'Mornings' }).click(); await page.waitForTimeout(1200)
log('after changes', await snap())
await page.reload(); await page.waitForTimeout(2500)
log('after reload', await snap())
// failure case: toggle with network failure, scrolled to the toggle
await page.route('**/api/matchmaking/account', route => route.request().method() === 'PUT' ? route.abort() : route.continue())
const sw = page.getByRole('switch', { name: 'Nearby suggestions' })
await sw.scrollIntoViewIfNeeded()
await sw.click(); await page.waitForTimeout(1500)
log('after failed toggle', await snap(), '| alerts:', await page.locator('[role=alert]').allInnerTexts())
log('alert in viewport:', await page.locator('[role=alert]').first().evaluate(e => { const b = e.getBoundingClientRect(); return b.bottom > 0 && b.top < innerHeight }).catch(() => 'none'))
await page.screenshot({ path: `${R}/AUTH-settings-failed-toggle-390.png` })
log(problems.join('\n'))
await close()
