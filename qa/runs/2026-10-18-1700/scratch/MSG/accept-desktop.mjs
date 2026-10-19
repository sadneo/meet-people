import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
import { readFileSync } from 'node:fs'
const R = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700'
const tok = u => JSON.parse(readFileSync(`/home/xqiu/Projects/meet-people/qa/.sessions/${u}.json`, 'utf8')).access_token
const r = await fetch('http://127.0.0.1:3000/api/connections/22222222-2222-4222-8222-222222222222', { method: 'POST', headers: { Authorization: `Bearer ${tok('erin')}`, 'Content-Type': 'application/json' }, body: '{}' })
console.log('erin->bob request', r.status, await r.text())
const B = await openAs('bob', { width: 1280, height: 860 })
const E = await openAs('erin', { width: 1280, height: 860 })
await E.page.goto('/messages'); await E.page.waitForTimeout(1500)
await B.page.goto('/messages'); await B.page.getByRole('button', { name: 'Accept' }).waitFor()
await B.shot(`${R}/screenshots/MSG-accept2-bob-before-1280.png`)
const t0 = Date.now()
await B.page.getByRole('button', { name: 'Accept' }).dblclick()
await B.page.waitForURL(/conversation=/)
await B.page.waitForTimeout(2000)
console.log('bob main after accept:\n' + await B.page.locator('main').ariaSnapshot())
await B.shot(`${R}/screenshots/MSG-accept2-bob-after-1280.png`)
await E.page.getByRole('button', { name: /Bob/ }).waitFor({ timeout: 40000 }).then(() => console.log('erin sees Bob chat after', Date.now() - t0)).catch(() => console.log('erin no chat in 40s'))
console.log('B', B.problems.filter(p => !p.includes('Not Found'))); console.log('E', E.problems.filter(p => !p.includes('Not Found')))
await B.close(); await E.close()
