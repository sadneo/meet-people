// node crop.mjs user WxH path selector outfile  -> screenshot of element (or viewport if selector='-') after optional scroll
import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const [user, size, path, selector, out, scrollY] = process.argv.slice(2)
const [width, height] = size.split('x').map(Number)
const { page, problems, close } = await openAs(user, { width, height })
await page.goto(path); await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(1500)
if (scrollY) await page.evaluate(y => window.scrollTo(0, Number(y)), scrollY)
await page.waitForTimeout(300)
if (selector && selector !== '-') { const loc = page.locator(selector).first(); await loc.scrollIntoViewIfNeeded(); await loc.screenshot({ path: out }) }
else await page.screenshot({ path: out })
console.log(problems.filter(p => !p.includes('404')).join('\n'))
await close()
