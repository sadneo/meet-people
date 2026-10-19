import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
import { readFileSync } from 'node:fs'
const R = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700'
const [action = 'Accept', w = 390, h = 844] = process.argv.slice(2)
const tok = u => JSON.parse(readFileSync(`/home/xqiu/Projects/meet-people/qa/.sessions/${u}.json`, 'utf8')).access_token
const api = async (u, method, path) => { const r = await fetch(`http://127.0.0.1:3000/api/connections/${path}`, { method, headers: { Authorization: `Bearer ${tok(u)}`, 'Content-Type': 'application/json' }, body: method === 'POST' ? '{}' : undefined }); return `${r.status} ${await r.text()}` }
console.log('erin state w/ bob:', await api('erin', 'GET', '22222222-2222-4222-8222-222222222222'))
console.log('erin disconnect bob:', await api('erin', 'DELETE', '22222222-2222-4222-8222-222222222222'))
console.log('erin request bob:', await api('erin', 'POST', '22222222-2222-4222-8222-222222222222'))
const B = await openAs('bob', { width: +w, height: +h })
await B.page.goto('/messages'); await B.page.getByRole('button', { name: action }).waitFor()
console.log('erin cancels:', await api('erin', 'DELETE', '22222222-2222-4222-8222-222222222222'))
await B.page.getByRole('button', { name: action }).click(); await B.page.waitForTimeout(1500)
console.log('url', B.page.url())
console.log('alerts:', await B.page.getByRole('alert').allInnerTexts())
console.log('requests still shown:', await B.page.getByRole('region', { name: 'Connection requests' }).count(), await B.page.getByRole('button', { name: 'Accept' }).count())
await B.shot(`${R}/screenshots/MSG-stale-${action.toLowerCase()}-${w}.png`)
// try clicking again
if (await B.page.getByRole('button', { name: action }).count()) { await B.page.getByRole('button', { name: action }).click(); await B.page.waitForTimeout(1500); console.log('2nd click alerts:', await B.page.getByRole('alert').allInnerTexts()) }
console.log(B.problems.filter(p => !p.includes('Not Found')))
await B.close()
