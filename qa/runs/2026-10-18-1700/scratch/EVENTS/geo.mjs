import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const R = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots'
const mode = process.argv[2] ?? 'grant'
const [w, h] = (process.argv[3] ?? '390x844').split('x').map(Number)
const { page, context, problems, close } = await openAs('dave', { width: w, height: h })
const reqs = []
page.on('request', r => { if (r.url().includes('/api/events?')) reqs.push(r.url().replace('http://127.0.0.1:3000', '')) })
if (mode === 'grant') { await context.grantPermissions(['geolocation']); await context.setGeolocation({ latitude: 42.28, longitude: -83.74 }) }
await page.goto('/events'); await page.waitForTimeout(2000)
const before = await page.locator('main').innerText()
const btn = page.getByRole('button', { name: 'Show distances from me' })
await btn.click(); await page.waitForTimeout(2500)
const after = await page.locator('main').innerText()
console.log('same text before/after:', before === after)
console.log('button attrs:', await btn.evaluate(b => ({ pressed: b.getAttribute('aria-pressed'), cls: b.className })))
console.log('main after:', after.replace(/\n+/g, ' | ').slice(0, 260))
console.log('requests:', reqs)
await page.screenshot({ path: `${R}/EVENTS-geo-${mode}-${w}.png` })
// next page / category keeps origin?
await page.getByRole('button', { name: 'Music' }).click(); await page.waitForTimeout(1500)
console.log('after Music:', reqs.at(-1))
await page.reload(); await page.waitForTimeout(1500)
console.log('after reload:', reqs.at(-1))
console.log('problems', problems.filter(p => !p.includes('favicon')))
await close()
