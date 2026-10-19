import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const run = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700'
const user = process.argv[2] ?? 'guest'
const [width, height] = (process.argv[3] ?? '390x844').split('x').map(Number)
const reduced = process.argv[4] === 'reduce'
const tag = `${user}-${width}${reduced ? '-rm' : ''}`
const { page, problems, shot, close } = await openAs(user, { width, height })
if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' })
const path = () => page.url().replace('http://127.0.0.1:3000', '')
try {
  await page.goto('/intro'); await page.waitForLoadState('networkidle').catch(() => {})
  const t0 = Date.now()
  await page.getByRole('button', { name: 'Open Pebble pouch' }).press('Enter')
  await page.waitForTimeout(700)
  await shot(`${run}/screenshots/home/intro-${tag}-open.png`)
  console.log('overflow during anim', await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth, document.documentElement.scrollHeight, innerHeight]))
  await page.waitForURL(u => !u.pathname.startsWith('/intro'), { timeout: 8000 })
  console.log('left intro after', Date.now() - t0, 'ms ->', path(), 'focus', await page.evaluate(() => document.activeElement?.tagName + ':' + document.activeElement?.textContent?.slice(0, 20)))
  await page.goBack(); await page.waitForTimeout(800)
  console.log('back ->', path(), await page.locator('.pebble-pouch-hint').innerText().catch(() => 'n/a'))
  console.log('problems', problems.filter(p => !p.includes('status of 404')))
} finally { await close() }
