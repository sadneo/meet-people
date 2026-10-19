import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const R = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots'
const [w, h] = (process.argv[2] ?? '390x844').split('x').map(Number)
const id = '2ee591e9-d31b-462e-b74a-86982616a33a'
const { page, problems, close } = await openAs('guest', { width: w, height: h })
await page.goto(`/events/${id}`); await page.waitForTimeout(2000)
await page.getByRole('button', { name: 'Find a group to go with' }).click()
await page.waitForTimeout(1500)
console.log('url after click:', page.url())
console.log((await page.locator('body').innerText()).replace(/\n+/g, ' | ').slice(0, 300))
await page.screenshot({ path: `${R}/EVENTS-guest-join-redirect-${w}.png` })
await page.goBack(); await page.waitForTimeout(1500)
console.log('after back:', page.url())
console.log('problems', problems.filter(p => !p.includes('favicon')))
await close()
