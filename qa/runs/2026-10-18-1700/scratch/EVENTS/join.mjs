import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const R = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots'
const user = process.argv[2] ?? 'dave'
const id = process.argv[3] ?? 'ab955825-dc9e-4c0f-9dbd-5128ae3a4a03'
const [w, h] = (process.argv[4] ?? '390x844').split('x').map(Number)
const tag = process.argv[5] ?? 'join'
const { page, problems, close } = await openAs(user, { width: w, height: h })
const log = []
page.on('response', r => { if (r.url().includes('/api/')) log.push(`${r.status()} ${r.request().method()} ${r.url().replace('http://127.0.0.1:3000','')}`) })
await page.goto(`/events/${id}`)
await page.waitForTimeout(2500)
const q = page.getByRole('region', { name: 'Event group queue' })
console.log('before:', await q.innerText())
const btn = q.getByRole('button').first()
console.log('button:', await btn.innerText(), 'disabled', await btn.isDisabled())
await btn.click()
await page.waitForTimeout(2000)
console.log('after click:', await q.innerText())
await q.screenshot({ path: `${R}/EVENTS-${tag}-${user}-${w}.png` })
console.log(log.join('\n'))
console.log('problems', problems)
await close()
