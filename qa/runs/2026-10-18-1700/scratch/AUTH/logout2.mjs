import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
import { readFileSync } from 'node:fs'
const user = process.argv[2] ?? 'qa-auth-2@example.com'
const via = process.argv[3] ?? 'menu'
const env = Object.fromEntries(readFileSync('/home/xqiu/Projects/meet-people/.env.local', 'utf8').trim().split('\n').map(l => l.split(/=(.*)/s, 2)))
const { page, problems, close } = await openAs(user, { width: 1280, height: 860 })
const log = (...a) => console.log(...a)
page.on('request', r => { if (r.url().includes('/auth/v1/')) log('  req', r.method(), r.url()) })
page.on('response', r => { if (r.url().includes('/auth/v1/')) log('  res', r.status(), r.url()) })
await page.goto(via === 'menu' ? '/profile' : '/settings'); await page.waitForTimeout(2000)
const key = await page.evaluate(() => Object.keys(localStorage).find(k => k.endsWith('-auth-token')))
const sess = JSON.parse(await page.evaluate(k => localStorage.getItem(k), key))
log('has refresh token:', !!sess.refresh_token)
if (via === 'menu') { await page.getByRole('button', { name: 'Account menu' }).click(); await page.waitForTimeout(300); await page.getByText('Log out', { exact: true }).click() }
else await page.getByRole('button', { name: 'Log out' }).click()
await page.waitForTimeout(3000)
log('url:', page.url())
// Is the old refresh token still usable?
const r = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: sess.refresh_token }) })
log('refresh after logout:', r.status, (await r.text()).slice(0, 120))
// Is the old access token still accepted by the API?
const a = await fetch('http://127.0.0.1:3000/api/matchmaking/account', { headers: { Authorization: `Bearer ${sess.access_token}` } })
log('API with old access token:', a.status)
log(problems.join('\n'))
await close()
