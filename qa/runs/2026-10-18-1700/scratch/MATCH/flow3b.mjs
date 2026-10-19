// hank connects from (stubbed) card; jack accepts in Messages; does hank's card switch to Message?
import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
import { candidate, stubResult } from './stub.mjs'
const S = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots/'
const tag = process.argv[2] ?? 'a'
const H = await openAs('hank', { width: 1280, height: 860 })
const J = await openAs('jack', { width: 390, height: 844 })
const card = async p => (await p.locator('.match-person').ariaSnapshot().catch(() => '(no card)'))
try {
  await stubResult(H.page, candidate())
  await H.page.goto('/downtime-matchmaking'); await H.page.waitForTimeout(2500)
  await H.page.getByRole('button', { name: 'Check for a match' }).click(); await H.page.waitForTimeout(1500)
  await H.page.getByRole('button', { name: 'Connect', exact: true }).click(); await H.page.waitForTimeout(1500)
  console.log('hank:\n' + await card(H.page))
  await J.page.goto('/messages'); await J.page.waitForTimeout(2500)
  await J.page.getByRole('button', { name: 'Accept' }).click(); await J.page.waitForTimeout(2000)
  console.log('jack url after accept:', J.page.url())
  await J.shot(S + `MATCH-flow3b-${tag}-jack-accepted-390.png`)
  const t0 = Date.now()
  await H.page.getByRole('link', { name: 'Message', exact: true }).waitFor({ timeout: 15000 }).catch(() => {})
  console.log('hank shows Message after', Date.now() - t0, 'ms:\n' + await card(H.page))
  await H.shot(S + `MATCH-flow3b-${tag}-hank-connected-1280.png`)
  await H.page.getByRole('link', { name: 'Message', exact: true }).click(); await H.page.waitForTimeout(2500)
  console.log('hank url after Message:', H.page.url())
  await H.shot(S + `MATCH-flow3b-${tag}-hank-chat-1280.png`)
} finally {
  console.log('HANK problems:\n' + H.problems.join('\n')); console.log('JACK problems:\n' + J.problems.join('\n'))
  await H.close(); await J.close()
}
