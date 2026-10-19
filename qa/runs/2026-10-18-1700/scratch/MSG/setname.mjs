import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync('/home/xqiu/Projects/meet-people/.env.local', 'utf8').trim().split('\n').map(l => l.split(/=(.*)/s, 2)))
const [user, name] = process.argv.slice(2)
const s = JSON.parse(readFileSync(`/home/xqiu/Projects/meet-people/qa/.sessions/${user}.json`, 'utf8'))
const r = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/profiles?id=eq.${s.user.id}`, { method: 'PATCH', headers: { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ display_name: name }) })
console.log(r.status, (await r.text()).slice(0, 200))
