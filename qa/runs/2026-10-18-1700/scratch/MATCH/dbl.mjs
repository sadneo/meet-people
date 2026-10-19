// Double clicks and fast toggles. User: jack (downtime).
import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const X = await openAs('jack', { width: 390, height: 844 })
const st = async () => JSON.stringify(await X.page.locator('.match-focus-status').evaluate(e => e.innerText))
let posts = 0, dels = 0
X.page.on('request', r => { if (r.url().endsWith('/api/matchmaking/queue')) r.method() === 'POST' ? posts++ : dels++ })
await X.page.goto('/downtime-matchmaking'); await X.page.waitForTimeout(2500)
console.log('start:', await st())
const btn = X.page.locator('.match-focus-actions button').last()
console.log('button:', await btn.textContent())
await btn.dblclick(); await X.page.waitForTimeout(2000)
console.log('after dblclick:', await st(), 'posts', posts, 'dels', dels)
const b2 = X.page.getByRole('button', { name: /Pause downtime matching|Turn on downtime matching/ })
await b2.click(); await b2.click({ timeout: 2000 }).catch(e => console.log('2nd click blocked (disabled)')); await X.page.waitForTimeout(2000)
console.log('after 2 fast clicks:', await st(), 'posts', posts, 'dels', dels)
const r = await (await fetch('http://127.0.0.1:3000/api/matchmaking/status', { headers: { Authorization: 'Bearer ' + JSON.parse((await import('node:fs')).readFileSync('/home/xqiu/Projects/meet-people/qa/.sessions/jack.json', 'utf8')).access_token } })).text()
console.log('server status:', r)
console.log(X.problems.join('\n'))
await X.close()
