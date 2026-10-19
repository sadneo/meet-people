// Tap targets, tab order and focus visibility on the matching page with a (stubbed) candidate. User: carol (downtime).
import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
import { candidate, stubResult } from './stub.mjs'
const S = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots/'
const X = await openAs('carol', { width: 390, height: 844 })
await stubResult(X.page, candidate())
await X.page.goto('/downtime-matchmaking'); await X.page.waitForTimeout(2500)
const on = X.page.getByRole('button', { name: 'Turn on downtime matching' }); if (await on.count()) { await on.click(); await X.page.waitForTimeout(1500) }
await X.page.getByRole('button', { name: 'Check for a match' }).click(); await X.page.waitForTimeout(2000)
console.log('focus after check:', await X.page.evaluate(() => document.activeElement?.textContent))
const sizes = await X.page.evaluate(() => [...document.querySelectorAll('main a, main button, main summary')].map(e => { const r = e.getBoundingClientRect(); return `${(e.getAttribute('aria-label') || e.textContent).trim().slice(0, 30)}: ${Math.round(r.width)}x${Math.round(r.height)}` }))
console.log(sizes.join('\n'))
await X.page.keyboard.press('Tab')
const order = []
for (let i = 0; i < 16; i++) {
  const info = await X.page.evaluate(() => { const e = document.activeElement; const cs = getComputedStyle(e); return `${(e.getAttribute('aria-label') || e.textContent).trim().slice(0, 30)} | outline=${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor} shadow=${cs.boxShadow.slice(0, 40)}` })
  order.push(info); await X.page.keyboard.press('Tab')
}
console.log(order.join('\n'))
await X.page.getByRole('button', { name: 'Connect', exact: true }).focus()
await X.page.screenshot({ path: S + 'MATCH-a11y-connect-focus-390.png' })
await X.close()
