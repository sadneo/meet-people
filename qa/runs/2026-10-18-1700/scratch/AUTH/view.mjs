import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const [user, path, size, out, scrollY = '0'] = process.argv.slice(2)
const [width, height] = size.split('x').map(Number)
const { page, problems, close } = await openAs(user, { width, height })
await page.goto(path); await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(1500)
await page.evaluate(y => window.scrollTo(0, y), Number(scrollY)); await page.waitForTimeout(300)
await page.screenshot({ path: out })
console.log(page.url()); console.log(problems.join('\n'))
await close()
