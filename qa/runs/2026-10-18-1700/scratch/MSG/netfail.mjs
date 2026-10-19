import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const R = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700'
const [w, h] = [+(process.argv[2] ?? 390), +(process.argv[3] ?? 844)]
const A = await openAs('alice', { width: w, height: h })
// 1. Inbox load fails
await A.page.route('**/api/conversations?page=1', r => r.abort())
await A.page.goto('/messages'); await A.page.waitForTimeout(2500)
console.log('[inbox abort] alerts:', await A.page.getByRole('alert').allInnerTexts())
console.log('[inbox abort] main:\n' + await A.page.locator('main').ariaSnapshot())
await A.shot(`${R}/screenshots/MSG-netfail-inbox-${w}.png`)
await A.page.unroute('**/api/conversations?page=1')
// 2. Chat load fails (503)
await A.page.route('**/api/conversations/*/messages', r => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Messages are unavailable right now."}' }))
await A.page.goto('/messages/chat?conversation=b3f4212b-ddec-4836-9b73-5d511c116d08'); await A.page.waitForTimeout(2500)
console.log('[chat 503] alerts:', await A.page.getByRole('alert').allInnerTexts())
await A.shot(`${R}/screenshots/MSG-netfail-chat-${w}.png`)
await A.page.unroute('**/api/conversations/*/messages')
await A.page.getByRole('button', { name: 'Retry messages' }).click(); await A.page.waitForTimeout(2000)
console.log('[chat retry] bubbles:', await A.page.locator('.pt-chat-bubble').count(), 'alerts', await A.page.getByRole('alert').allInnerTexts())
console.log(A.problems.filter(p => !p.includes('favicon') && !p.includes('404 (Not')))
await A.close()
