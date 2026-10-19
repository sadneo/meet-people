// Downtime queue: hank + jack, candidate card, Connect, request visible to jack.
import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const S = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots/'
const tag = process.argv[2] ?? 'a'
const status = async p => (await p.locator('.match-focus-status').textContent())
const H = await openAs('hank', { width: 1280, height: 860 })
const J = await openAs('jack', { width: 390, height: 844 })
try {
  await H.page.goto('/downtime-matchmaking'); await J.page.goto('/downtime-matchmaking')
  await H.page.waitForTimeout(2500); await J.page.waitForTimeout(500)
  console.log('hank start:', await status(H.page), '| jack start:', await status(J.page))
  await H.page.getByRole('button', { name: 'Turn on downtime matching' }).click()
  await H.page.waitForTimeout(1500)
  console.log('hank after join:', await status(H.page))
  await H.shot(S + `MATCH-flow1-${tag}-hank-queued.png`)
  await H.page.getByRole('button', { name: 'Check for a match' }).click()
  await H.page.waitForTimeout(2000)
  console.log('hank check alone:', await status(H.page))
  await H.shot(S + `MATCH-flow1-${tag}-hank-nocandidate.png`)
  await J.page.getByRole('button', { name: 'Turn on downtime matching' }).click()
  await J.page.waitForTimeout(1500)
  console.log('jack after join:', await status(J.page))
  await J.page.getByRole('button', { name: 'Check for a match' }).click()
  await J.page.waitForTimeout(2500)
  console.log('jack check:', await status(J.page))
  console.log('jack card:', await J.page.locator('main').ariaSnapshot())
  await J.shot(S + `MATCH-flow1-${tag}-jack-candidate-390.png`)
  await H.page.getByRole('button', { name: 'Check for a match' }).click()
  await H.page.waitForTimeout(2500)
  console.log('hank check 2:', await status(H.page))
  await H.shot(S + `MATCH-flow1-${tag}-hank-candidate-1280.png`)
  console.log('hank card:', await H.page.locator('main').ariaSnapshot())
} finally {
  console.log('HANK problems:\n' + H.problems.join('\n')); console.log('JACK problems:\n' + J.problems.join('\n'))
  await H.close(); await J.close()
}
