// Matching notifications dialog. User: jack.
import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const S = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots/'
const tag = process.argv[2] ?? 'a'
for (const [w, h] of [[390, 844], [1280, 860]]) {
  const X = await openAs('jack', { width: w, height: h })
  await X.page.goto('/matchmaking'); await X.page.waitForTimeout(2500)
  await X.page.getByRole('button', { name: /Matching notifications/ }).click(); await X.page.waitForTimeout(1200)
  console.log(w, await X.page.locator('dialog[open]').ariaSnapshot())
  await X.page.screenshot({ path: S + `MATCH-notif-${tag}-${w}.png` })
  console.log('focused:', await X.page.evaluate(() => document.activeElement?.outerHTML.slice(0, 100)))
  await X.page.keyboard.press('Escape'); await X.page.waitForTimeout(400)
  console.log('open after esc:', await X.page.locator('dialog[open]').count(), 'focus back:', await X.page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
  // where does the bell appear on other pages?
  for (const p of ['/', '/events', '/messages', '/profile']) { await X.page.goto(p); await X.page.waitForTimeout(1200); console.log(p, 'bell count', await X.page.getByRole('button', { name: /Matching notifications/ }).count()) }
  console.log(X.problems.join('\n'))
  await X.close()
}
