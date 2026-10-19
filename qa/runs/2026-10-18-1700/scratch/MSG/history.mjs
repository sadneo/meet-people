import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
import { execFileSync } from 'node:child_process'
const R = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700'
const A = await openAs('alice', { width: 390, height: 844 })
await A.page.goto('/messages/chat?conversation=6297ae9d-9f11-4123-b82b-727394f9e1af')
await A.page.getByRole('textbox', { name: 'Message' }).waitFor(); await A.page.waitForTimeout(2000)
const pane = A.page.locator('section.pt-chat')
const pos = () => pane.evaluate(p => ({ top: Math.round(p.scrollTop), h: p.scrollHeight, c: p.clientHeight, fromBottom: Math.round(p.scrollHeight - p.scrollTop - p.clientHeight) }))
console.log('on open', await pos(), 'bubbles', await A.page.locator('.pt-chat-bubble').count())
console.log('load earlier button?', await A.page.getByRole('button', { name: 'Load earlier messages' }).count())
// erin sends 3 while alice at bottom
execFileSync('node', [`${R}/scratch/MSG/bulk.mjs`, 'erin', '6297ae9d-9f11-4123-b82b-727394f9e1af', '3', 'Erin live'])
await A.page.locator('.pt-chat-bubble', { hasText: 'Erin live 3' }).waitFor({ timeout: 15000 })
await A.page.waitForTimeout(500)
console.log('after incoming at bottom', await pos())
// Scroll up and receive
await pane.evaluate(p => { p.scrollTop = 200 })
await A.page.waitForTimeout(300)
execFileSync('node', [`${R}/scratch/MSG/bulk.mjs`, 'erin', '6297ae9d-9f11-4123-b82b-727394f9e1af', '1', 'Erin while scrolled'])
await A.page.locator('.pt-chat-bubble', { hasText: 'Erin while scrolled 1' }).waitFor({ timeout: 15000 })
await A.page.waitForTimeout(500)
console.log('after incoming while scrolled up', await pos(), '(any new-message hint?)', await A.page.getByText(/new message/i).count())
await A.shot(`${R}/screenshots/MSG-history-scrolledup-390.png`)
console.log(A.problems.filter(p => !p.includes('Not Found')))
await A.close()
