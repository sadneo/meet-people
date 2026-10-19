// jack is in the downtime queue; open the Active page, check, then "Cancel search".
import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const S = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots/'
const tag = process.argv[2] ?? 'a'
const [w, h] = (process.argv[3] ?? '390x844').split('x').map(Number)
const X = await openAs('jack', { width: w, height: h })
const visibleStatus = async () => X.page.locator('.match-focus-status').evaluate(e => e.innerText)
await X.page.goto('/downtime-matchmaking'); await X.page.waitForTimeout(2500)
if (await X.page.getByRole('button', { name: 'Turn on downtime matching' }).count()) { await X.page.getByRole('button', { name: 'Turn on downtime matching' }).click(); await X.page.waitForTimeout(1500) }
await X.page.goto('/matchmaking'); await X.page.waitForTimeout(2500)
console.log('active page, visible status:', JSON.stringify(await visibleStatus()))
await X.page.getByRole('button', { name: 'Check for a match' }).click(); await X.page.waitForTimeout(2000)
console.log('after check, visible status:', JSON.stringify(await visibleStatus()))
await X.page.screenshot({ path: S + `MATCH-cross-${tag}-active-in-downtime-${w}.png` })
await X.page.getByRole('button', { name: 'Cancel search' }).click(); await X.page.waitForTimeout(1500)
console.log('after Cancel search on Active page:', JSON.stringify(await visibleStatus()))
await X.page.goto('/downtime-matchmaking'); await X.page.waitForTimeout(2500)
console.log('downtime page now:', JSON.stringify(await visibleStatus()), await X.page.getByRole('button', { name: /downtime matching/ }).textContent())
console.log(X.problems.join('\n'))
await X.close()
