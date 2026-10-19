import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const run = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700'
const user = process.argv[2] ?? 'guest'
const [width, height] = (process.argv[3] ?? '390x844').split('x').map(Number)
const { page, problems, shot, close } = await openAs(user, { width, height })
const path = () => page.url().replace('http://127.0.0.1:3000', '')
try {
  await page.goto('/intro'); await page.waitForLoadState('networkidle').catch(() => {})
  await page.getByRole('button', { name: 'Open Pebble pouch' }).click()
  await page.waitForURL(u => !u.pathname.startsWith('/intro'), { timeout: 8000 })
  await page.waitForTimeout(1000)
  console.log('at', path(), 'h1', await page.locator('main h1').allInnerTexts(), 'pouch present', await page.locator('.pebble-pouch-intro').count(), 'focus', await page.evaluate(() => document.activeElement?.tagName + ':' + document.activeElement?.textContent?.slice(0, 20)))
  await shot(`${run}/screenshots/home/intro2-${user}-${width}-home.png`)
  await page.goBack(); await page.waitForTimeout(300)
  console.log('back ->', path(), 'hint', await page.locator('.pebble-pouch-hint').innerText().catch(() => 'n/a'), 'class', await page.locator('.pebble-pouch-intro').getAttribute('class').catch(() => 'n/a'))
  await shot(`${run}/screenshots/home/intro2-${user}-${width}-back.png`)
  for (let i = 0; i < 6; i++) { await page.waitForTimeout(500); console.log(`  +${(i + 1) * 500}ms`, path(), await page.locator('.pebble-pouch-intro').getAttribute('class').catch(() => 'n/a')) }
  // Use the in-app path: dev panel replay
  console.log('problems', problems.filter(p => !p.includes('status of 404')))
} finally { await close() }
