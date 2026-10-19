import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const R = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots'
const user = process.argv[2] ?? 'dave'
const id = process.argv[3] ?? '2ee591e9-d31b-462e-b74a-86982616a33a'
const mode = process.argv[4] ?? 'slow'
const [w, h] = (process.argv[5] ?? '390x844').split('x').map(Number)
const { page, problems, close } = await openAs(user, { width: w, height: h })
if (mode === 'slow') await page.route('**/api/matchmaking/profile', async r => { await new Promise(res => setTimeout(res, 1500)); await r.continue() })
if (mode === 'none') await page.route('**/api/matchmaking/profile', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ profile: null }) }))
await page.goto(`/events/${id}`)
const q = page.getByRole('region', { name: 'Event group queue' })
await q.waitFor()
const sample = async label => { const t = await q.innerText().catch(() => ''); const b = await q.getByRole('button').first(); console.log(label, '|', /matching profile/.test(t) ? 'PROFILE WARNING' : 'no warning', '|', await b.innerText().catch(()=>'?'), (await b.isDisabled().catch(()=>null)) ? '(disabled)' : '(enabled)') }
for (let i = 0; i < 6; i++) { await sample(`t=${i * 400}ms`); if (i === 1) await q.screenshot({ path: `${R}/EVENTS-profile-${mode}-load-${w}.png` }); await page.waitForTimeout(400) }
await page.waitForTimeout(1500)
await sample('settled')
await q.screenshot({ path: `${R}/EVENTS-profile-${mode}-settled-${w}.png` })
await q.getByRole('button', { name: 'Refresh queue' }).click()
for (let i = 0; i < 5; i++) { await sample(`after refresh t=${i * 400}ms`); await page.waitForTimeout(400) }
console.log('problems', problems.filter(p => !p.includes('favicon')))
await close()
