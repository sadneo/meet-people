import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const R = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700'
const [w, h, tag] = [+(process.argv[2] ?? 1280), +(process.argv[3] ?? 860), process.argv[4] ?? 'rt']
const A = await openAs('alice', { width: w, height: h })
const B = await openAs('bob', { width: w, height: h })
for (const [s, other] of [[A, 'Bob'], [B, 'Alice']]) {
  await s.page.goto('/messages')
  await s.page.getByRole('button', { name: new RegExp(other) }).first().click()
  await s.page.getByRole('textbox', { name: 'Message' }).waitFor()
  await s.page.waitForTimeout(1500)
}
const text = `QA ping ${tag} ${Date.now()}`
const box = A.page.getByRole('textbox', { name: 'Message' })
await box.click(); await box.fill(text)
const t0 = Date.now()
await box.press('Enter')
await A.page.locator('.pt-chat-bubble', { hasText: text }).waitFor()
console.log('alice sees own msg after', Date.now() - t0, 'ms')
await A.page.waitForTimeout(500)
console.log('alice focus after send:', await A.page.evaluate(() => document.activeElement?.tagName + ' ' + (document.activeElement?.id || document.activeElement?.className)))
console.log('alice input value after send:', JSON.stringify(await box.inputValue()))
await B.page.locator('.pt-chat-bubble', { hasText: text }).waitFor({ timeout: 20000 })
console.log('bob sees msg after', Date.now() - t0, 'ms')
// Seen for alice
const seen = A.page.locator('.pt-message-row.is-mine').last().getByText('Seen')
const t1 = Date.now()
await seen.waitFor({ timeout: 20000 }).then(() => console.log('alice sees Seen after', Date.now() - t1, 'ms (since bob received)')).catch(() => console.log('alice never saw Seen in 20s'))
// Count Seen labels on alice side
console.log('Seen count alice:', await A.page.getByText('Seen', { exact: true }).count())
await A.shot(`${R}/screenshots/MSG-${tag}-alice.png`); await B.shot(`${R}/screenshots/MSG-${tag}-bob.png`)
console.log('A problems', A.problems.filter(p => !p.includes('favicon') && !p.includes('404 (Not Found)')))
console.log('B problems', B.problems.filter(p => !p.includes('favicon') && !p.includes('404 (Not Found)')))
await A.close(); await B.close()
