// Candidate card content edges via stubbed result (real Connect state lookup). User: carol (in downtime queue).
import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
import { candidate, stubResult } from './stub.mjs'
const S = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots/'
const tag = process.argv[2] ?? 'a'
const cases = {
  long: candidate({ name: 'Maximiliana Alexandrovna Bartholomew-Featherstonehaugh Wolfeschlegelsteinhausenbergerdorff', interests: ['Competitive ultimate frisbee and weekend tournaments around the Bay Area', 'Supercalifragilisticexpialidocious-themed-baking-nights', 'jazz', 'graphic design', 'fifth hidden interest', 'sixth'], overlap: 'extended' }),
  meetup: candidate({ mode: 'active', overlap: 'none', avatar: 'https://example.com/does-not-exist.png', meetup: { id: 42, title: 'Sunset picnic at Dolores Park', location: 'Dolores Park, near the tennis courts', startsAt: '2026-10-24T23:30:00.000Z' } }),
  nointerests: candidate({ interests: [], overlap: 'none' }),
}
for (const [name, cand] of Object.entries(cases)) for (const [w, h] of [[390, 844], [1280, 860]]) {
  const X = await openAs('carol', { width: w, height: h })
  await stubResult(X.page, cand)
  if (cand.mode === 'active') await X.page.route('**/api/matchmaking/status', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"mode":"active"}' }))
  await X.page.goto(cand.mode === 'active' ? '/matchmaking' : '/downtime-matchmaking'); await X.page.waitForTimeout(2500)
  await X.page.getByRole('button', { name: 'Check for a match' }).click(); await X.page.waitForTimeout(2000)
  const overflow = await X.page.evaluate(() => ({ page: document.documentElement.scrollWidth > innerWidth, card: [...document.querySelectorAll('.match-person *')].filter(e => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'visible').length, wide: [...document.querySelectorAll('.match-person *')].filter(e => e.getBoundingClientRect().right > innerWidth).map(e => e.tagName + ':' + e.textContent.slice(0, 20)) }))
  console.log(name, w, JSON.stringify(overflow))
  if (w === 390) console.log(await X.page.locator('.match-person').ariaSnapshot())
  await X.shot(S + `MATCH-card-${tag}-${name}-${w}.png`)
  console.log(X.problems.filter(p => !p.includes('favicon') && !p.includes('404 (Not Found)')).join('\n'))
  await X.close()
}
