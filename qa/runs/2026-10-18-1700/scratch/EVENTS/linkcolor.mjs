import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const R = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots'
const { page, close } = await openAs('dave', { width: 390, height: 844 })
await page.goto('/events'); await page.waitForTimeout(2000)
const c = () => page.locator('.ev-name-link').evaluateAll(els => els.map(e => getComputedStyle(e).color))
console.log('title link colors:', await c())
await page.locator('.ev-name-link').nth(1).click(); await page.waitForTimeout(1500)
await page.goBack(); await page.waitForTimeout(2000)
await page.locator('.ev-name-link').nth(1).scrollIntoViewIfNeeded()
await page.screenshot({ path: `${R}/EVENTS-visited-link-390.png` })
console.log('h1 count on detail page:', await (async () => { await page.goto('/events/ab955825-dc9e-4c0f-9dbd-5128ae3a4a03'); await page.waitForTimeout(1500); return page.locator('h1').count() })())
console.log('document titles:', await page.title())
await page.goto('/events'); await page.waitForTimeout(1000); console.log('list title:', await page.title())
await close()
