import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const { page, close } = await openAs('liam', { width: 390, height: 844 })
page.on('response', async r => { if (r.url().includes('/api/')) { let b = ''; try { b = (await r.text()).slice(0, 600) } catch {} console.log(r.request().method(), r.url().replace('http://127.0.0.1:3000',''), r.status(), b) } })
await page.goto('/messages/chat?conversation=17a7b258-e2ec-4f3d-864a-d112fe3ceb70'); await page.waitForTimeout(3000)
await close()
