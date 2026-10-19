import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const [user = 'alice', w = '1280', h = '860', name = 'Bob', out = 'chat'] = process.argv.slice(2)
const R = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700'
const { page, problems, shot, close } = await openAs(user, { width: +w, height: +h })
await page.goto('/messages')
await page.getByRole('button', { name: new RegExp(name) }).first().click()
await page.waitForTimeout(2000)
console.log('URL', page.url())
console.log(await page.locator('main').ariaSnapshot())
await shot(`${R}/screenshots/MSG-${out}-${user}-${w}.png`)
console.log(problems.join('\n'))
await close()
