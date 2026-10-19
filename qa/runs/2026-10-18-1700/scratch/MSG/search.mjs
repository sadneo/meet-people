import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const R = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700'
const A = await openAs('alice', { width: 390, height: 844 })
await A.page.goto('/messages'); await A.page.getByRole('button', { name: /Bob/ }).waitFor()
const s = A.page.getByRole('searchbox', { name: 'Search conversations' })
for (const q of ['erin', 'ERIN', 'bulk', 'Thursday', 'zzzz', '  bob', 'Martinez Bob']) {
  await s.fill(q); await A.page.waitForTimeout(200)
  const items = await A.page.locator('.pt-conversation strong').allInnerTexts()
  const none = await A.page.getByText('No conversations match your search.').count()
  console.log(JSON.stringify(q), '->', items, none ? '(no-match msg)' : '')
}
await s.fill('zzzz'); await A.shot(`${R}/screenshots/MSG-search-nomatch-390.png`)
// does the search persist after opening a chat and coming back?
await s.fill('erin'); await A.page.getByRole('button', { name: /Erin/ }).click(); await A.page.waitForTimeout(1000)
await A.page.getByRole('link', { name: 'Back to messages' }).click(); await A.page.waitForTimeout(800)
console.log('search after back:', JSON.stringify(await s.inputValue()), await A.page.locator('.pt-conversation strong').allInnerTexts())
await A.close()
