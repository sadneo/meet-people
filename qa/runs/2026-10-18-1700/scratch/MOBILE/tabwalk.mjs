// Usage: node tabwalk.mjs <user> <WxH> <route> [maxTabs]
import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const [user, size, routeArg, maxArg = '45'] = process.argv.slice(2)
const CHAT = '/messages/chat?conversation=17a7b258-e2ec-4f3d-864a-d112fe3ceb70'
const EVENT = '/events/ab955825-dc9e-4c0f-9dbd-5128ae3a4a03'
const route = routeArg === 'CHAT' ? CHAT : routeArg === 'EVENT' ? EVENT : routeArg
const [width, height] = size.split('x').map(Number)
const { page, problems, close } = await openAs(user, { width, height })
await page.goto(route); await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(1500)
// start from the document: click on empty spot is risky; blur instead
await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0) })
const rows = []
let first = null
for (let i = 0; i < Number(maxArg); i++) {
  await page.keyboard.press('Tab')
  await page.waitForTimeout(120)
  const info = await page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) return { el: 'body' }
    const desc = n => { let s = n.tagName.toLowerCase(); const cls = typeof n.className === 'string' ? n.className : n.className?.baseVal; if (cls) s += '.' + cls.trim().split(/\s+/).slice(0, 2).join('.'); return s }
    const name = el.getAttribute('aria-label') || (el.labels?.[0]?.textContent) || (el.innerText || el.textContent || '').trim().slice(0, 30) || el.getAttribute('title') || el.getAttribute('placeholder') || ''
    const r = el.getBoundingClientRect()
    const s = getComputedStyle(el)
    let indicator = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) ? `outline ${s.outlineWidth} ${s.outlineColor}` : (s.boxShadow !== 'none' ? 'box-shadow' : '')
    if (!indicator) for (let n = el.parentElement, k = 0; n && k < 3; n = n.parentElement, k++) { const ps = getComputedStyle(n); if (ps.outlineStyle !== 'none' && parseFloat(ps.outlineWidth) > 0) { indicator = 'parent outline ' + desc(n); break } }
    if (!indicator && el.tagName.toLowerCase() === 'rect') { indicator = `svg stroke ${s.stroke} ${s.strokeWidth}` }
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2
    let obscured = ''
    if (r.width === 0 || r.height === 0) obscured = 'zero-size'
    else if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) obscured = `offscreen (${Math.round(r.left)},${Math.round(r.top)})`
    else {
      const top = document.elementFromPoint(Math.min(Math.max(cx, 0), innerWidth - 1), Math.min(Math.max(cy, 0), innerHeight - 1))
      if (top && top !== el && !el.contains(top) && !top.contains(el)) {
        for (let n = top; n; n = n.parentElement) { const p = getComputedStyle(n).position; if (p === 'fixed' || p === 'sticky') { obscured = 'covered by ' + desc(n); break } }
        if (!obscured) obscured = 'center covered by ' + desc(top)
      }
    }
    return { el: desc(el), name: name.replace(/\s+/g, ' ').slice(0, 40), indicator, obscured, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], key: el.outerHTML.slice(0, 80) }
  })
  if (first && info.key === first && i > 2) { rows.push({ ...info, note: 'wrapped to first' }); break }
  if (!first && info.el !== 'body') first = info.key
  rows.push(info)
}
console.log(`== ${route} ${size} ${user} final URL ${page.url().replace('http://127.0.0.1:3000', '')}`)
rows.forEach((r, i) => console.log(`${String(i + 1).padStart(2)} ${r.el} "${r.name}" ${r.indicator || 'NO-INDICATOR'} ${r.obscured ? '!! ' + r.obscured : ''} ${JSON.stringify(r.rect)} ${r.note || ''}`))
const pr = problems.filter(p => !p.includes('404'))
if (pr.length) console.log('problems:', pr.join(' | '))
await close()
