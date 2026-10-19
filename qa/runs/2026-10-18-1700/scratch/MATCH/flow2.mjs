// hank sees (stubbed) candidate jack, presses the real Connect; jack checks Messages; hank cancels.
import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
import { candidate, stubResult } from './stub.mjs'
const S = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots/'
const tag = process.argv[2] ?? 'a'
const H = await openAs('hank', { width: 390, height: 844 })
const J = await openAs('jack', { width: 390, height: 844 })
try {
  await stubResult(H.page, candidate())
  await H.page.goto('/downtime-matchmaking'); await H.page.waitForTimeout(2500)
  console.log('hank status:', await H.page.locator('.match-focus-status').textContent())
  await H.page.getByRole('button', { name: 'Check for a match' }).click()
  await H.page.waitForTimeout(2000)
  console.log('hank card:\n' + await H.page.locator('main').ariaSnapshot())
  await H.shot(S + `MATCH-flow2-${tag}-hank-card-390.png`)
  await H.page.getByRole('button', { name: 'Connect' }).dblclick()
  await H.page.waitForTimeout(2000)
  console.log('hank after connect:\n' + await H.page.locator('.match-person').ariaSnapshot())
  await H.shot(S + `MATCH-flow2-${tag}-hank-sent-390.png`)
  await J.page.goto('/messages'); await J.page.waitForTimeout(3000)
  console.log('jack messages:\n' + await J.page.locator('body').ariaSnapshot())
  await J.shot(S + `MATCH-flow2-${tag}-jack-messages-390.png`)
  // hank cancels
  await H.page.getByRole('button', { name: 'Cancel request' }).click()
  await H.page.waitForTimeout(2000)
  console.log('hank after cancel:\n' + await H.page.locator('.match-person').ariaSnapshot())
  await H.shot(S + `MATCH-flow2-${tag}-hank-cancelled-390.png`)
  await J.page.waitForTimeout(1000)
  console.log('jack messages (no reload) still shows request:', await J.page.getByText('Wants to connect').count())
  await J.page.reload(); await J.page.waitForTimeout(3000)
  console.log('jack messages after reload shows request:', await J.page.getByText('Wants to connect').count())
} finally {
  console.log('HANK problems:\n' + H.problems.join('\n')); console.log('JACK problems:\n' + J.problems.join('\n'))
  await H.close(); await J.close()
}
