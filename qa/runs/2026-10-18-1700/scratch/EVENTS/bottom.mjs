import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const R = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots'
const user = process.argv[2] ?? 'dave'
const path = process.argv[3] ?? '/events/2ee591e9-d31b-462e-b74a-86982616a33a'
const [w, h] = (process.argv[4] ?? '390x844').split('x').map(Number)
const { page, close } = await openAs(user, { width: w, height: h })
await page.goto(path); await page.waitForTimeout(2500)
await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(500)
const nav = await page.locator('nav[aria-label="Primary navigation"]').last().boundingBox()
const buttons = await page.locator('main button, main a').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return [e.innerText.slice(0, 25), Math.round(r.top), Math.round(r.bottom)] }).slice(-4))
console.log('nav top', nav?.y, 'last controls', JSON.stringify(buttons))
await page.screenshot({ path: `${R}/EVENTS-bottom-${user}-${w}.png` })
await close()
