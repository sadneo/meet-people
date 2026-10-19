import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const run = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700'
const user = process.argv[2] ?? 'guest'
const [width, height] = (process.argv[3] ?? '390x844').split('x').map(Number)
const { page, problems, shot, close } = await openAs(user, { width, height })
const path = () => page.url().replace('http://127.0.0.1:3000', '')
const navSel = width > 800 ? '.pt-desktop-nav' : '.pt-bottom-nav'
const state = async () => ({ path: path(), h1: await page.locator('main h1').allInnerTexts().catch(() => []), active: await page.locator(`${navSel} a[aria-current=page]`).getAttribute('aria-label').catch(() => null), focus: await page.evaluate(() => document.activeElement?.tagName + ':' + (document.activeElement?.textContent ?? '').slice(0, 30)) })
try {
  await page.goto('/'); await page.waitForLoadState('networkidle').catch(() => {})
  for (const label of ['Matchmaking', 'Events', 'Messages', ...(width <= 800 ? ['Profile'] : []), 'Home']) {
    await page.locator(navSel).getByRole('link', { name: label }).click(); await page.waitForTimeout(900)
    console.log('tab', label, JSON.stringify(await state()))
  }
  await page.getByRole('link', { name: 'Community' }).click(); await page.waitForTimeout(800)
  console.log('community', JSON.stringify(await state()))
  await page.getByRole('link', { name: 'Back to Home' }).click(); await page.waitForTimeout(800)
  console.log('back to home', JSON.stringify(await state()))
  await page.getByRole('link', { name: 'Find people' }).click(); await page.waitForTimeout(900)
  console.log('find people', JSON.stringify(await state()))
  await page.goBack(); await page.waitForTimeout(600)
  await page.getByRole('link', { name: 'Downtime matchmaking' }).click(); await page.waitForTimeout(900)
  console.log('downtime', JSON.stringify(await state()))
  await shot(`${run}/screenshots/home/nav-${user}-${width}-downtime.png`)
  if (width > 800) { await page.getByRole('link', { name: 'Pebble home' }).click(); await page.waitForTimeout(600); console.log('logo', JSON.stringify(await state())) }
  console.log('problems', problems.filter(p => !p.includes('status of 404')))
} finally { await close() }
