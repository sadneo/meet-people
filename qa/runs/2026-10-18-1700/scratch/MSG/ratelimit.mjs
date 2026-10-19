import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const R = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700'
const A = await openAs('alice', { width: 390, height: 844 })
await A.page.goto('/messages/chat?conversation=6297ae9d-9f11-4123-b82b-727394f9e1af')
const box = A.page.getByRole('textbox', { name: 'Message' })
await box.waitFor(); await A.page.waitForTimeout(1500)
for (let i = 0; i < 5; i++) {
  await box.click(); await box.fill(`UI rate ${i}`); await box.press('Enter'); await A.page.waitForTimeout(700)
  const alert = await A.page.getByRole('alert').allInnerTexts()
  if (alert.length) { console.log('after', i, 'alert:', alert); break }
}
await A.shot(`${R}/screenshots/MSG-ratelimit-390.png`)
console.log(A.problems.filter(p => !p.includes('Not Found')))
await A.close()
