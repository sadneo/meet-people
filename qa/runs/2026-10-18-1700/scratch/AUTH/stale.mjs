import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const R = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots'
const { page, problems, close } = await openAs(process.argv[2], { width: 1280, height: 860 })
page.on('response', r => { if (r.url().includes('/auth/v1/') || r.url().includes('/api/')) console.log('  res', r.status(), r.request().method(), r.url()) })
await page.goto(process.argv[3] ?? '/profile'); await page.waitForTimeout(3000)
console.log(page.url(), '|', (await page.locator('h1, h2, [role=status], [role=alert]').allInnerTexts()).slice(0, 5).join(' / '))
await page.screenshot({ path: `${R}/${process.argv[4] ?? 'AUTH-stale.png'}` })
console.log(problems.join('\n'))
await close()
