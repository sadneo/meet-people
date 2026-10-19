import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const R = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700'
const A = await openAs('alice', { width: 1280, height: 860 })
await A.page.goto('/messages/chat?conversation=b3f4212b-ddec-4836-9b73-5d511c116d08')
const box = A.page.getByRole('textbox', { name: 'Message' })
await box.waitFor(); await A.page.waitForTimeout(1500)
const tag = `dbl-${Date.now() % 100000}`
await box.fill(tag)
// Slow the send so double actions overlap
await A.page.route('**/messages', async route => { if (route.request().method() === 'POST') { await new Promise(r => setTimeout(r, 1500)); await route.continue() } else await route.continue() })
await A.page.evaluate(() => { const f = document.querySelector('form.pt-composer'); f.requestSubmit(); f.requestSubmit(); f.requestSubmit() })
await A.page.getByRole('button', { name: /Send/ }).dblclick({ force: true }).catch(() => {})
await A.page.waitForTimeout(4000)
console.log('bubbles with tag (this tab):', await A.page.locator('.pt-chat-bubble', { hasText: tag }).count())
await A.page.unroute('**/messages')
await A.page.reload(); await box.waitFor(); await A.page.waitForTimeout(1500)
console.log('bubbles with tag after reload:', await A.page.locator('.pt-chat-bubble', { hasText: tag }).count())
await A.close()
