import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const R = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots'
const [w, h] = (process.argv[2] ?? '390x844').split('x').map(Number)
const id = '2ee591e9-d31b-462e-b74a-86982616a33a'
const DAVE = '44444444-4444-4444-8444-444444444444'
const { page, problems, close } = await openAs('dave', { width: w, height: h })
const proposal = { id: '12345678-1234-4234-8234-123456789012', eventId: id, members: [
  { id: DAVE, name: 'Dave Okafor', avatar: null },
  { id: '99999999-9999-4999-8999-999999999999', name: 'Iris', avatar: 'https://img.test/a.jpg' },
  { id: '88888888-8888-4888-8888-888888888888', name: 'A very long display name that goes on and on and on', avatar: null } ] }
await page.route('https://img.test/**', r => r.abort())
await page.route('**/group-queue', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ state: 'proposal', proposal }) }))
await page.goto(`/events/${id}`); await page.waitForTimeout(2500)
const q = page.getByRole('region', { name: 'Event group queue' })
await q.getByRole('button', { name: 'Review proposal' }).click(); await page.waitForTimeout(500)
console.log((await q.innerText()).replace(/\n+/g, ' | '))
await q.screenshot({ path: `${R}/EVENTS-proposal-${w}.png` })
console.log('problems', problems.filter(p => !p.includes('favicon')))
await close()
