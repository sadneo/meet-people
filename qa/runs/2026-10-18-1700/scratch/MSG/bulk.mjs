import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
const [user, conv, n, prefix] = process.argv.slice(2)
const tok = JSON.parse(readFileSync(`/home/xqiu/Projects/meet-people/qa/.sessions/${user}.json`, 'utf8')).access_token
for (let i = 1; i <= +n; i++) {
  const r = await fetch(`http://127.0.0.1:3000/api/conversations/${conv}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ body: `${prefix} ${i}`, clientRequestId: randomUUID() }) })
  if (!r.ok) { console.log(i, r.status, await r.text()); break }
}
console.log('done')
