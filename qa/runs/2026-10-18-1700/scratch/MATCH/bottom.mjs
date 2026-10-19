import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const [user, path, size, out] = process.argv.slice(2)
const [width, height] = size.split('x').map(Number)
const { page, problems, close } = await openAs(user, { width, height })
await page.goto(path); await page.waitForTimeout(2500)
await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
await page.waitForTimeout(500)
const info = await page.evaluate(() => {
  const d = document.querySelector('details.match-device-disclosure')
  const nav = document.querySelector('nav')
  const r = d?.getBoundingClientRect(), n = nav?.getBoundingClientRect()
  const s = d?.querySelector('summary')
  const sr = s?.getBoundingClientRect()
  const hit = sr ? document.elementFromPoint(sr.x + sr.width/2, sr.y + sr.height/2) : null
  return { scrollH: document.documentElement.scrollHeight, inner: innerHeight, details: r && [r.top, r.bottom], nav: n && [n.top, n.bottom], summary: sr && [sr.top, sr.bottom, sr.height], hitTag: hit?.tagName + '.' + hit?.className }
})
console.log(JSON.stringify(info))
await page.screenshot({ path: out })
console.log(problems.join('\n'))
await close()
