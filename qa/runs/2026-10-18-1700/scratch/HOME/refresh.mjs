import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const run = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700'
const user = process.argv[2] ?? 'guest'
const [width, height] = (process.argv[3] ?? '390x844').split('x').map(Number)
const reduced = process.argv[4] === 'reduce'
const tag = `${user}-${width}${reduced ? '-rm' : ''}`
const { page, context, problems, shot, close } = await openAs(user, { width, height })
if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' })
const names = () => page.locator('.pt-thought-bubble .pt-thought-name').allInnerTexts()
try {
  await page.goto('/'); await page.waitForLoadState('networkidle').catch(() => {})
  console.log('start', await names())
  const btn = page.getByRole('button', { name: 'Refresh people who are available now' })
  const t0 = Date.now()
  await btn.dblclick()
  await btn.click()
  await page.waitForTimeout(200)
  console.log('thinking class', await page.locator('.pt-available-preview').getAttribute('class'), 'pebble expr', await page.locator('.pt-pebble-refresh [data-expression], .pt-pebble-refresh img').first().getAttribute('data-expression').catch(() => '?'))
  await shot(`${run}/screenshots/home/refresh-${tag}-thinking.png`)
  await page.waitForFunction(() => !document.querySelector('.pt-available-preview')?.classList.contains('is-thinking'), null, { timeout: 10000 })
  console.log('thinking ms', Date.now() - t0)
  console.log('after 1 refresh (3 clicks)', await names(), 'focused:', await page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
  console.log('status', await page.locator('.pt-available-preview [role=status]').innerText())
  // cycle several times
  for (let i = 0; i < 4; i++) { await btn.click(); await page.waitForFunction(() => !document.querySelector('.pt-available-preview')?.classList.contains('is-thinking'), null, { timeout: 10000 }); console.log('refresh', i + 2, await names()) }
  await shot(`${run}/screenshots/home/refresh-${tag}-after.png`)
  // leave during thinking
  await btn.click(); await page.waitForTimeout(300)
  await page.getByRole('link', { name: 'Community' }).click()
  await page.waitForTimeout(2500)
  await page.goBack(); await page.waitForTimeout(800)
  console.log('back home after leaving mid-think', page.url(), await names(), await page.locator('.pt-available-preview').getAttribute('class'))
  // keyboard activation
  await btn.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(300)
  console.log('kbd thinking', await page.locator('.pt-available-preview').getAttribute('class'), 'focused:', await page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
  await page.waitForTimeout(2000)
  console.log('kbd after', await names(), 'focused:', await page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
  const anim = await page.evaluate(() => [...document.querySelectorAll('.pt-home-idle-frame, .pt-thought-bubble, .pt-pebble')].map(e => getComputedStyle(e).animationName + '/' + getComputedStyle(e).transitionDuration).slice(0, 6))
  console.log('animations', anim)
  console.log('problems', problems.filter(p => !p.includes('status of 404')))
} finally { await close() }
