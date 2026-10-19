// node api.mjs <user> <METHOD> <path> [jsonBody] — calls the app API with the user's cached session token.
import { readFileSync } from 'node:fs'
import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const [user, method, path, body] = process.argv.slice(2)
const file = `/home/xqiu/Projects/meet-people/qa/.sessions/${user}.json`
let token
try { const s = JSON.parse(readFileSync(file, 'utf8')); if (s.expires_at * 1000 - Date.now() > 300000) token = s.access_token } catch {}
if (!token) { const x = await openAs(user); await x.close(); token = JSON.parse(readFileSync(file, 'utf8')).access_token }
const r = await fetch('http://127.0.0.1:3000' + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body })
console.log(r.status, await r.text())
