import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
for (const [w,h] of [[390,844],[1280,860]]) {
const { page, close } = await openAs('grace', { width: w, height: h })
await page.goto('/profile'); await page.waitForTimeout(2500)
console.log(w, await page.evaluate(() => {
  const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { top: Math.round(b.top), left: Math.round(b.left), w: Math.round(b.width), h: Math.round(b.height), display: cs.display, bg: cs.backgroundColor, color: cs.color } }
  return { summary: r('.pt-profile-summary'), cover: r('.pt-profile-cover'), portrait: r('.pt-profile-portrait'), avatar: r('.pt-profile-portrait .pt-avatar'), svg: r('.pt-profile-portrait .pt-avatar svg') }
}))
await close() }
