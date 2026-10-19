// carol sends a request from a (stubbed) candidate card, then the card goes away. Where can she see or cancel it?
import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
import { candidate, stubResult } from './stub.mjs'
const S = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots/'
const tag = process.argv[2] ?? 'a'
const how = process.argv[3] ?? 'reload'
const X = await openAs('carol', { width: 390, height: 844 })
await X.page.goto('/downtime-matchmaking'); await X.page.waitForTimeout(2500)
if (await X.page.getByRole('button', { name: 'Turn on downtime matching' }).count()) { await X.page.getByRole('button', { name: 'Turn on downtime matching' }).click(); await X.page.waitForTimeout(1500) }
await stubResult(X.page, candidate())
await X.page.getByRole('button', { name: 'Check for a match' }).click(); await X.page.waitForTimeout(1500)
await X.page.getByRole('button', { name: 'Connect', exact: true }).click(); await X.page.waitForTimeout(1500)
console.log('card after connect:\n' + await X.page.locator('.match-person').ariaSnapshot())
await X.page.unroute('**/api/matchmaking/result')
if (how === 'reload') { await X.page.reload(); await X.page.waitForTimeout(2500) }
else { await X.page.getByRole('button', { name: 'Check for a match' }).click(); await X.page.waitForTimeout(2500) }
console.log(`matching after ${how}:`, await X.page.locator('.match-focus-status').textContent(), '| card count:', await X.page.locator('.match-person').count())
await X.page.screenshot({ path: S + `MATCH-orphan-${tag}-after-${how}-390.png` })
await X.page.goto('/messages'); await X.page.waitForTimeout(3000)
console.log('messages mentions Jack:', await X.page.getByText('Jack').count())
console.log(await X.page.locator('main').ariaSnapshot())
await X.page.screenshot({ path: S + `MATCH-orphan-${tag}-messages-390.png` })
await X.page.goto('/profile'); await X.page.waitForTimeout(2500)
console.log('profile mentions Jack:', await X.page.getByText('Jack').count())
console.log(X.problems.join('\n'))
await X.close()
