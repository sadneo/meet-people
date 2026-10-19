import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const R = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots'
const user = process.argv[2] ?? 'dave'
const [w, h] = (process.argv[3] ?? '390x844').split('x').map(Number)
const { page, problems, close } = await openAs(user, { width: w, height: h })
const paths = ['/events/00000000-0000-4000-8000-000000000000', '/events/not-a-real-id', '/events?category=Music', '/events?category=Sports', '/events?page=999', '/events?page=10001', '/events?page=2', `/events?category=${'x'.repeat(81)}`]
for (const [i, p] of paths.entries()) {
  await page.goto(p); await page.waitForTimeout(1800)
  console.log(`--- ${p.slice(0, 60)}\n${(await page.locator('main').innerText()).replace(/\n+/g, ' | ').slice(0, 400)}`)
  await page.screenshot({ path: `${R}/EVENTS-edge-${i}-${w}.png` })
}
console.log('problems', problems.filter(p => !p.includes('favicon')))
await close()
