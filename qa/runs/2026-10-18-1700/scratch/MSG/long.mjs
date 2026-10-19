import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const R = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700'
const [w, h] = [+(process.argv[2] ?? 390), +(process.argv[3] ?? 844)]
const A = await openAs('alice', { width: w, height: h })
await A.page.goto('/messages/chat?conversation=6297ae9d-9f11-4123-b82b-727394f9e1af')
const box = A.page.getByRole('textbox', { name: 'Message' })
await box.waitFor(); await A.page.waitForTimeout(1500)
await box.click()
// Paste 2500 chars
const para = ('Lorem ipsum dolor sit amet, consectetur adipiscing elit. ').repeat(50) // ~2850
await A.page.keyboard.insertText(para)
const v = await box.inputValue()
console.log('pasted', para.length, 'chars; input holds', v.length)
console.log('any visible hint/counter?', await A.page.locator('.pt-composer').innerText())
await A.shot(`${R}/screenshots/MSG-long-composer-${w}.png`)
await box.press('Enter')
await A.page.waitForTimeout(1500)
const last = await A.page.locator('.pt-chat-bubble').last().innerText()
console.log('sent bubble length', last.length, 'ends with:', JSON.stringify(last.slice(-30)))
// Long unbroken string and HTML
await box.click(); await A.page.keyboard.insertText('https://example.com/' + 'a'.repeat(300) + ' <b>bold?</b> <img src=x onerror=alert(1)> 😀 مرحبا')
await box.press('Enter'); await A.page.waitForTimeout(1500)
await A.shot(`${R}/screenshots/MSG-long-chat-${w}.png`)
console.log('overflow', await A.page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth, [...document.querySelectorAll('.pt-chat-bubble')].map(b => b.scrollWidth > b.clientWidth + 1).some(Boolean)]))
// Check inbox preview for long message at this viewport
await A.page.goto('/messages'); await A.page.waitForTimeout(2000)
await A.shot(`${R}/screenshots/MSG-long-inbox-${w}.png`)
console.log('inbox overflow', await A.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth))
console.log(A.problems)
await A.close()
