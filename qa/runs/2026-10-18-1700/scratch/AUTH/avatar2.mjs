import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const { page, close } = await openAs('grace', { width: 390, height: 844 })
await page.goto('/profile'); await page.waitForTimeout(2500)
console.log(await page.evaluate(() => {
  const e = document.querySelector('.pt-profile-portrait .pt-avatar'); const cs = getComputedStyle(e)
  const out = { cls: e.className, position: cs.position, top: cs.top, left: cs.left, inset: cs.inset, transform: cs.transform, margin: cs.margin }
  const rules = []
  for (const sheet of document.styleSheets) { try { for (const rule of sheet.cssRules) { if (rule.selectorText && e.matches(rule.selectorText) && /position|top|inset|transform/.test(rule.cssText)) rules.push(rule.cssText.slice(0, 250)) } } catch {} }
  return { out, rules }
}))
await close()
