import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const R = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots'
const user = process.argv[2] ?? 'dave'
const size = process.argv[3] ?? '390x844'
const [w, h] = size.split('x').map(Number)
const id = 'ab955825-dc9e-4c0f-9dbd-5128ae3a4a03'
const { page, problems, close } = await openAs(user, { width: w, height: h })
const main = () => page.locator('main').innerText()
// (a) list failure then retry
await page.route('**/api/events?*', r => r.abort())
await page.goto('/events'); await page.waitForTimeout(2000)
console.log('A list failed:', JSON.stringify(await main()))
await page.screenshot({ path: `${R}/EVENTS-fail-list-${w}.png` })
await page.unroute('**/api/events?*')
await page.getByRole('button', { name: 'Retry' }).click(); await page.waitForTimeout(2000)
console.log('A after retry:', (await main()).slice(0, 120).replace(/\n/g, ' | '))
// (b) detail failure
await page.route(`**/api/events/${id}`, r => r.abort())
await page.goto(`/events/${id}`); await page.waitForTimeout(2000)
console.log('B detail failed:', JSON.stringify(await main()))
await page.screenshot({ path: `${R}/EVENTS-fail-detail-${w}.png` })
await page.unroute(`**/api/events/${id}`)
// (b2) detail returns 502 html
await page.route(`**/api/events/${id}`, r => r.fulfill({ status: 502, contentType: 'text/html', body: '<html><body>Bad gateway</body></html>' }))
await page.goto(`/events/${id}`); await page.waitForTimeout(2000)
console.log('B2 detail 502 html:', JSON.stringify(await main()))
await page.screenshot({ path: `${R}/EVENTS-fail-detail-502-${w}.png` })
await page.unroute(`**/api/events/${id}`)
// (c) queue GET failure
await page.route('**/group-queue', r => r.abort())
await page.goto(`/events/${id}`); await page.waitForTimeout(2500)
const q = page.getByRole('region', { name: 'Event group queue' })
console.log('C queue GET failed:', JSON.stringify(await q.innerText()))
await q.screenshot({ path: `${R}/EVENTS-fail-queue-get-${w}.png` })
await page.unroute('**/group-queue')
// (d) join/leave POST/DELETE failure
await page.goto(`/events/${id}`); await page.waitForTimeout(2500)
await page.route('**/group-queue', r => r.request().method() === 'GET' ? r.continue() : r.abort())
const before = await q.getByRole('status').innerText()
await q.getByRole('button').first().click(); await page.waitForTimeout(2000)
console.log('D before', before, '| after failed action:', JSON.stringify(await q.innerText()))
await q.screenshot({ path: `${R}/EVENTS-fail-queue-action-${w}.png` })
console.log('problems', problems)
await close()
