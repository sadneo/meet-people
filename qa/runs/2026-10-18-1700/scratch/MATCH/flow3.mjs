// Mutual: both see each other's (stubbed) card; hank connects, jack connects -> connected; hank's card updates?
import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
import { candidate, stubResult, IDS } from './stub.mjs'
const S = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots/'
const tag = process.argv[2] ?? 'a'
const H = await openAs('hank', { width: 1280, height: 860 })
const J = await openAs('jack', { width: 390, height: 844 })
const card = async p => (await p.locator('.match-person').ariaSnapshot().catch(() => '(no card)'))
try {
  await stubResult(H.page, candidate())
  await stubResult(J.page, candidate({ id: IDS.hank, name: 'Hank Rivera', interests: ['road cycling', 'jazz music', 'graphic design'] }))
  for (const X of [H, J]) { await X.page.goto('/downtime-matchmaking') }
  await H.page.waitForTimeout(2500)
  for (const X of [H, J]) { await X.page.getByRole('button', { name: 'Check for a match' }).click() }
  await H.page.waitForTimeout(2000)
  await H.page.getByRole('button', { name: 'Connect' }).click(); await H.page.waitForTimeout(1500)
  console.log('hank:\n' + await card(H.page)); console.log('jack (stale?):\n' + await card(J.page))
  await J.page.getByRole('button', { name: 'Connect' }).click(); await J.page.waitForTimeout(1500)
  console.log('jack after connect:\n' + await card(J.page))
  await J.shot(S + `MATCH-flow3-${tag}-jack-connected-390.png`)
  const t0 = Date.now()
  await H.page.getByRole('link', { name: 'Message' }).waitFor({ timeout: 15000 }).catch(() => {})
  console.log('hank shows Message after', Date.now() - t0, 'ms:\n' + await card(H.page))
  await H.shot(S + `MATCH-flow3-${tag}-hank-connected-1280.png`)
  await J.page.getByRole('link', { name: 'Message' }).click(); await J.page.waitForTimeout(2500)
  console.log('jack url after Message:', J.page.url())
  await J.shot(S + `MATCH-flow3-${tag}-jack-chat-390.png`)
} finally {
  console.log('HANK problems:\n' + H.problems.join('\n')); console.log('JACK problems:\n' + J.problems.join('\n'))
  await H.close(); await J.close()
}
