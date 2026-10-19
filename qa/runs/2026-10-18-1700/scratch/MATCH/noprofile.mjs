// Profile gating UI with GET /profile stubbed to { profile: null }. User: jack. Nothing is saved.
import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const S = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots/'
const tag = process.argv[2] ?? 'a'
for (const [w, h] of [[390, 844], [1280, 860]]) {
  const X = await openAs('jack', { width: w, height: h })
  await X.page.route('**/api/matchmaking/profile', r => r.request().method() === 'GET' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"profile":null}' }) : r.abort())
  await X.page.goto('/matchmaking'); await X.page.waitForTimeout(2500)
  console.log(w, await X.page.locator('main').ariaSnapshot())
  await X.shot(S + `MATCH-noprofile-${tag}-${w}.png`)
  await X.close()
}
