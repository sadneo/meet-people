import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
import { readFileSync } from 'node:fs'
const R = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700'
const tok = u => JSON.parse(readFileSync(`/home/xqiu/Projects/meet-people/qa/.sessions/${u}.json`, 'utf8')).access_token
const B = await openAs('bob', { width: 1280, height: 860 })
await B.page.goto('/messages'); await B.page.waitForTimeout(2000)
// erin sends a request to bob while bob has Messages open
const r = await fetch('http://127.0.0.1:3000/api/connections/22222222-2222-4222-8222-222222222222', { method: 'POST', headers: { Authorization: `Bearer ${tok('erin')}`, 'Content-Type': 'application/json' }, body: '{}' })
console.log('erin->bob request', r.status, await r.text())
const t0 = Date.now()
await B.page.getByRole('button', { name: 'Decline' }).waitFor({ timeout: 45000 }).then(() => console.log('bob sees request after', Date.now() - t0, 'ms without refresh')).catch(() => console.log('bob never saw request in 45s'))
await B.shot(`${R}/screenshots/MSG-decline-bob-before-1280.png`)
await B.page.getByRole('button', { name: 'Decline' }).click()
await B.page.waitForTimeout(1500)
await B.shot(`${R}/screenshots/MSG-decline-bob-after-1280.png`)
console.log(await B.page.locator('main').ariaSnapshot())
const s = await fetch('http://127.0.0.1:3000/api/connections/22222222-2222-4222-8222-222222222222', { headers: { Authorization: `Bearer ${tok('erin')}` } })
console.log('erin state for bob', await s.text())
console.log(B.problems)
await B.close()
