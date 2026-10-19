import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const R = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700'
const B = await openAs('bob', { width: 390, height: 844 })
const nav = () => B.page.locator('a[aria-label="Messages"]:visible').first().getAttribute('title')
await B.page.goto('/messages'); await B.page.waitForTimeout(2000)
console.log('nav before open:', await nav())
await B.page.getByRole('button', { name: /Alice/ }).click()
await B.page.waitForTimeout(2500)
console.log('nav after open:', await nav())
await B.page.getByRole('link', { name: 'Back to messages' }).click()
await B.page.waitForTimeout(1500)
console.log('inbox after back:\n', await B.page.locator('.pt-conversations').ariaSnapshot())
await B.shot(`${R}/screenshots/MSG-navdot-bob-after-390.png`)
await B.close()
