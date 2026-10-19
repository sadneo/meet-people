// Failed-network behaviour on the matching page. User: carol (not in a queue at start).
import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
import { candidate, stubResult, IDS } from './stub.mjs'
const S = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots/'
const tag = process.argv[2] ?? 'a'
const main = async p => (await p.locator('main').ariaSnapshot())
// (a) status fails on load
{
  const X = await openAs('carol', { width: 390, height: 844 })
  await X.page.route('**/api/matchmaking/status', r => r.abort())
  await X.page.goto('/matchmaking'); await X.page.waitForTimeout(2500)
  console.log('(a) status aborted on load:\n' + await main(X.page))
  await X.shot(S + `MATCH-err-${tag}-status-aborted-390.png`)
  await X.page.unroute('**/api/matchmaking/status')
  await X.page.getByRole('button', { name: 'Refresh status' }).click(); await X.page.waitForTimeout(1500)
  console.log('(a2) after refresh with network back:\n' + await main(X.page))
  await X.close()
}
// (b) join fails
{
  const X = await openAs('carol', { width: 390, height: 844 })
  await X.page.goto('/matchmaking'); await X.page.waitForTimeout(2500)
  await X.page.route('**/api/matchmaking/queue', r => r.abort())
  await X.page.getByRole('button', { name: 'Start matching' }).click(); await X.page.waitForTimeout(1500)
  console.log('(b) join aborted:\n' + await main(X.page))
  await X.shot(S + `MATCH-err-${tag}-join-aborted-390.png`)
  await X.close()
}
// (c) profile fails on load
{
  const X = await openAs('carol', { width: 390, height: 844 })
  await X.page.route('**/api/matchmaking/profile', r => r.abort())
  await X.page.goto('/matchmaking'); await X.page.waitForTimeout(2500)
  console.log('(c) profile aborted:\n' + await main(X.page))
  await X.shot(S + `MATCH-err-${tag}-profile-aborted-390.png`)
  await X.close()
}
// (d) connect fails / (e) connection state fails
{
  const X = await openAs('carol', { width: 390, height: 844 })
  await stubResult(X.page, candidate({ mode: 'active' }))
  await X.page.route('**/api/matchmaking/status', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"mode":"active"}' }))
  await X.page.goto('/matchmaking'); await X.page.waitForTimeout(2500)
  await X.page.route(`**/api/connections/${IDS.jack}`, r => r.request().method() === 'POST' ? r.abort() : r.continue())
  await X.page.getByRole('button', { name: 'Check for a match' }).click(); await X.page.waitForTimeout(1500)
  await X.page.getByRole('button', { name: 'Connect', exact: true }).click(); await X.page.waitForTimeout(1500)
  console.log('(d) connect aborted:\n' + await X.page.locator('.match-person').ariaSnapshot())
  await X.shot(S + `MATCH-err-${tag}-connect-aborted-390.png`)
  await X.close()
}
{
  const X = await openAs('carol', { width: 390, height: 844 })
  await stubResult(X.page, candidate({ mode: 'active' }))
  await X.page.route('**/api/matchmaking/status', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"mode":"active"}' }))
  await X.page.route(`**/api/connections/${IDS.jack}`, r => r.abort())
  await X.page.goto('/matchmaking'); await X.page.waitForTimeout(2500)
  await X.page.getByRole('button', { name: 'Check for a match' }).click(); await X.page.waitForTimeout(1500)
  console.log('(e) connection state aborted:\n' + await X.page.locator('.match-person').ariaSnapshot())
  await X.shot(S + `MATCH-err-${tag}-state-aborted-390.png`)
  await X.page.unroute(`**/api/connections/${IDS.jack}`)
  await X.page.waitForTimeout(6000)
  console.log('(e2) 6s after network back:\n' + await X.page.locator('.match-person').ariaSnapshot())
  await X.close()
}
