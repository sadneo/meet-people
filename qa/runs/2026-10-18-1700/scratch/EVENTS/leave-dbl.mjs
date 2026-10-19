import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const R = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots'
const user = process.argv[2] ?? 'dave'
const id = process.argv[3] ?? 'ab955825-dc9e-4c0f-9dbd-5128ae3a4a03'
const { page, problems, close } = await openAs(user, { width: 390, height: 844 })
const log = []
page.on('response', r => { if (r.url().includes('group-queue')) log.push(`${r.status()} ${r.request().method()}`) })
await page.goto(`/events/${id}`)
await page.waitForTimeout(2500)
const q = page.getByRole('region', { name: 'Event group queue' })
const status = () => q.getByRole('status').innerText()
console.log('start:', await status())
let btn = q.getByRole('button').first()
console.log('btn', await btn.innerText())
// double click
await btn.dblclick()
await page.waitForTimeout(2000)
console.log('after dblclick:', await status(), '| btn', await q.getByRole('button').first().innerText())
console.log(log.join(', '))
log.length = 0
// reload
await page.reload(); await page.waitForTimeout(2500)
console.log('after reload:', await status(), '| btn', await q.getByRole('button').first().innerText())
console.log(log.join(', '))
console.log('problems', problems)
await close()
