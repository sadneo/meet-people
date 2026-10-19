import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const R = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700'
const A = await openAs('alice', { width: 1280, height: 860 })
await A.page.goto('/messages/chat?conversation=b3f4212b-ddec-4836-9b73-5d511c116d08')
await A.page.getByRole('textbox', { name: 'Message' }).waitFor(); await A.page.waitForTimeout(1500)
for (const w of [801, 850, 900, 1000, 1024, 1100, 1200, 1280, 1440]) {
  await A.page.setViewportSize({ width: w, height: 860 }); await A.page.waitForTimeout(300)
  const r = await A.page.evaluate(() => {
    const h = document.querySelector('.pt-inbox-pane h1').getBoundingClientRect()
    const b = [...document.querySelectorAll('.pt-inbox-pane button')].find(b => b.textContent.trim() === 'Refresh').getBoundingClientRect()
    const pane = document.querySelector('.pt-inbox-pane').getBoundingClientRect()
    const h1 = document.querySelector('.pt-inbox-pane h1')
    return { pane: Math.round(pane.width), h1Right: Math.round(h.right), btnLeft: Math.round(b.left), overlap: h.right > b.left + 1 && h.top < b.bottom && h.bottom > b.top, h1Clipped: h1.scrollWidth > h1.clientWidth }
  })
  console.log(w, JSON.stringify(r))
  if ([801, 900, 1024].includes(w)) await A.page.screenshot({ path: `${R}/screenshots/MSG-width-${w}.png` })
}
await A.close()
