import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const R = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots'
const user = process.argv[2] ?? 'iris'
const { page, close } = await openAs(user, { width: 390, height: 844 })
await page.goto('/events'); await page.waitForTimeout(2000)
const card = page.locator('article').first()
console.log(user, 'card 1:', (await card.innerText()).replace(/\n+/g, ' | '))
await card.screenshot({ path: `${R}/EVENTS-01-card-${user}.png` })
await card.getByRole('link', { name: 'See event & people' }).click(); await page.waitForTimeout(2500)
const main = await page.locator('main').innerText()
console.log('detail mentions people/names:', /Dave|Iris|people looking/.test(main), '| status:', await page.getByRole('region', { name: 'Event group queue' }).getByRole('status').innerText())
await page.screenshot({ path: `${R}/EVENTS-01-detail-${user}.png`, fullPage: true })
await close()
