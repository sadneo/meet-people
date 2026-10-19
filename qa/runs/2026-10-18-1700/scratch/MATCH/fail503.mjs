// Real "Check for a match" with an eligible person in the same queue (no embedding service locally). carol + jack, downtime.
import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const S = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots/'
const tag = process.argv[2] ?? 'a'
const [w, h] = (process.argv[3] ?? '390x844').split('x').map(Number)
const C = await openAs('carol', { width: w, height: h })
const J = await openAs('jack', { width: 390, height: 844 })
for (const X of [C, J]) {
  await X.page.goto('/downtime-matchmaking'); await X.page.waitForTimeout(2500)
  const on = X.page.getByRole('button', { name: 'Turn on downtime matching' })
  if (await on.count()) { await on.click(); await X.page.waitForTimeout(1500) }
}
for (let i = 1; i <= 3; i++) {
  await C.page.getByRole('button', { name: 'Check for a match' }).click(); await C.page.waitForTimeout(2500)
  console.log(`try ${i}:`, JSON.stringify(await C.page.locator('.match-focus-status').evaluate(e => e.innerText)), '|', await C.page.locator('.match-error').textContent().catch(() => '(no error)'))
}
await C.page.screenshot({ path: S + `MATCH-503-${tag}-carol-${w}.png` })
await C.page.getByRole('button', { name: 'Refresh status' }).click(); await C.page.waitForTimeout(1500)
console.log('after Refresh status:', JSON.stringify(await C.page.locator('.match-focus-status').evaluate(e => e.innerText)), '| error:', await C.page.locator('.match-error').count())
console.log('CAROL', C.problems.join('\n'))
await C.close(); await J.close()
