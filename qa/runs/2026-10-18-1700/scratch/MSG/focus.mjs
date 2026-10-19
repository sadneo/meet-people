import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const R = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700'
const A = await openAs('alice', { width: 390, height: 844 })
await A.page.goto('/messages')
await A.page.getByRole('button', { name: /Bob/ }).first().click()
const box = A.page.getByRole('textbox', { name: 'Message' })
await box.waitFor(); await A.page.waitForTimeout(1500)
for (const how of ['enter', 'click']) {
  await box.click(); await box.fill(`QA focus check via ${how}`)
  console.log(`[${how}] focus before:`, await A.page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName))
  if (how === 'enter') await box.press('Enter'); else await A.page.getByRole('button', { name: /^Send/ }).click()
  await A.page.locator('.pt-chat-bubble', { hasText: `QA focus check via ${how}` }).waitFor()
  await A.page.waitForTimeout(400)
  console.log(`[${how}] focus after:`, await A.page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName))
  // Can the user just keep typing?
  await A.page.keyboard.type('next')
  console.log(`[${how}] typed "next" without re-tapping -> input value:`, JSON.stringify(await box.inputValue()))
  await box.fill('')
}
await A.shot(`${R}/screenshots/MSG-focus-after-send-390.png`)
await A.close()
