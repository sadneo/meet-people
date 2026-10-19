import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const R = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots'
const path = process.argv[2] ?? '/events'
const n = Number(process.argv[3] ?? 14)
const [w, h] = (process.argv[4] ?? '390x844').split('x').map(Number)
const { page, close } = await openAs('dave', { width: w, height: h })
await page.goto(path); await page.waitForTimeout(2500)
for (let i = 0; i < n; i++) {
  await page.keyboard.press('Tab')
  const info = await page.evaluate(() => { const el = document.activeElement; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return `${el.tagName} "${(el.getAttribute('aria-label') || el.innerText || '').slice(0, 40).replace(/\n/g, ' ')}" outline=${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor} box=${Math.round(r.width)}x${Math.round(r.height)} @y${Math.round(r.y)}` })
  console.log(i + 1, info)
  if (process.argv[5] && Number(process.argv[5]) === i + 1) await page.screenshot({ path: `${R}/EVENTS-focus-${i + 1}-${w}.png` })
}
await close()
