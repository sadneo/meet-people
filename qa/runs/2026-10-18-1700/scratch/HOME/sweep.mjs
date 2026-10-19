import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const run = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700'
const paths = ['/', '/community', '/intro', '/profile/person', '/free-time', '/free-time/matches', '/free-time/activities', '/free-time/plan', '/free-time/review', '/free-time/confirmed', '/free-time/connection', '/this-does-not-exist', '/free-time/nope']
const users = process.argv[2] ? [process.argv[2]] : ['guest', 'frank']
const sizes = [[390, 844], [1280, 860]]
for (const user of users) for (const [width, height] of sizes) {
  const { page, problems, shot, close } = await openAs(user, { width, height })
  for (const path of paths) {
    problems.length = 0
    await page.goto(path)
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(1200)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    const h1 = await page.locator('h1').allInnerTexts().catch(() => [])
    const name = `${user}-${width}-${path.replace(/\//g, '_') || 'root'}`
    await shot(`${run}/screenshots/home/${name}.png`)
    console.log(`${user} ${width} ${path} -> ${page.url().replace('http://127.0.0.1:3000', '')} overflow=${overflow} h1=${JSON.stringify(h1)} problems=${JSON.stringify(problems.filter(p => !p.includes('favicon')))}`)
  }
  await close()
}
