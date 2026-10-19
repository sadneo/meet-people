import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const RUN = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700'
const [size = '390x844', tag = 'a'] = process.argv.slice(2)
const [width, height] = size.split('x').map(Number)
for (const [route, target, file] of [['/settings', 'Mornings', 'settings'], ['/matchmaking', 'On this device', 'matchmaking']]) {
  const { page, close } = await openAs('liam', { width, height })
  await page.goto(route); await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(1500)
  await page.evaluate(() => document.activeElement?.blur?.())
  let found = false
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab'); await page.waitForTimeout(100)
    const name = await page.evaluate(() => (document.activeElement?.innerText || '').trim())
    if (name.startsWith(target)) { found = true; break }
  }
  const info = await page.evaluate(() => { const r = document.activeElement.getBoundingClientRect(); const n = document.querySelector('.pt-bottom-nav').getBoundingClientRect(); return { focused: [Math.round(r.top), Math.round(r.bottom)], navTop: Math.round(n.top), scrollY: Math.round(scrollY) } })
  console.log(route, size, 'found', found, JSON.stringify(info))
  await page.screenshot({ path: `${RUN}/screenshots/MOBILE-focus-hidden-${file}-${width}-${tag}.png` })
  await close()
}
