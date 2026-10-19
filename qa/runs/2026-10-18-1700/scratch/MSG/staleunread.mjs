import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
import { execFileSync } from 'node:child_process'
const R = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700'
const [w, h, tag, back = 'link'] = [+(process.argv[2] ?? 390), +(process.argv[3] ?? 844), process.argv[4] ?? 'a', process.argv[5]]
execFileSync('node', [`${R}/scratch/MSG/bulk.mjs`, 'alice', 'b3f4212b-ddec-4836-9b73-5d511c116d08', '2', `Unread test ${tag}`])
const B = await openAs('bob', { width: w, height: h })
const log = []
const t0 = Date.now()
B.page.on('request', r => { if (r.url().includes('/api/conversations')) log.push(`${Date.now() - t0}ms > ${r.method()} ${r.url().replace('http://127.0.0.1:3000/api/conversations', '')}`) })
B.page.on('response', r => { if (r.url().includes('/api/conversations')) log.push(`${Date.now() - t0}ms < ${r.status()} ${r.url().replace('http://127.0.0.1:3000/api/conversations', '')}`) })
await B.page.goto('/messages'); await B.page.getByRole('button', { name: /Alice/ }).waitFor(); await B.page.waitForTimeout(1000)
console.log('inbox before:', await B.page.getByRole('button', { name: /Alice/ }).getAttribute('aria-label') ?? await B.page.getByRole('button', { name: /Alice/ }).innerText())
log.push('--- click conversation')
await B.page.getByRole('button', { name: /Alice/ }).click()
await B.page.locator('.pt-chat-bubble', { hasText: `Unread test ${tag} 2` }).waitFor()
await B.page.waitForTimeout(2500)
log.push('--- back')
if (back === 'browser') await B.page.goBack(); else if (w > 800) await B.page.getByRole('button', { name: /Alice/ }).isVisible() ; if (back !== 'browser') { if (w <= 800) await B.page.getByRole('link', { name: 'Back to messages' }).click(); else await B.page.goto('/messages', { waitUntil: 'commit' }).catch(() => {}) }
await B.page.waitForTimeout(2000)
const snap = await B.page.locator('.pt-conversations').ariaSnapshot()
console.log('inbox after back:\n' + snap)
await B.shot(`${R}/screenshots/MSG-stale-unread-${tag}-${w}.png`)
console.log(log.join('\n'))
await B.close()
