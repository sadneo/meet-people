import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const run = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700'
const user = process.argv[2] ?? 'guest'
const [width, height] = (process.argv[3] ?? '1280x860').split('x').map(Number)
const tag = `${user}-${width}`
const { page, problems, shot, close } = await openAs(user, { width, height })
const pos = () => page.locator('[data-object="base-cottage"]').getAttribute('transform')
try {
  await page.goto('/community'); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(800)
  console.log('before', await pos())
  await page.getByRole('button', { name: 'Move Cottage' }).focus()
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(300)
  console.log('after keyboard', await pos(), 'status:', await page.locator('#community-diorama [role=status]').innerText())
  // drag friend pebble with mouse
  const friend = page.locator('[data-object="friend"] rect')
  const fb = await friend.boundingBox()
  const before = await page.locator('[data-object="friend"]').getAttribute('transform')
  await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2); await page.mouse.down(); await page.mouse.move(fb.x + fb.width / 2 - 40, fb.y + fb.height / 2 + 30, { steps: 8 }); await page.mouse.up()
  await page.waitForTimeout(300)
  console.log('friend drag', before, '->', await page.locator('[data-object="friend"]').getAttribute('transform'))
  await shot(`${run}/screenshots/home/community-${tag}-moved.png`)
  console.log('localStorage', await page.evaluate(() => localStorage.getItem('pebble:full-ui:community:v1')))
  // navigate away and back (in-app)
  await page.getByRole('link', { name: 'Back to Home' }).click(); await page.waitForTimeout(500)
  await page.getByRole('link', { name: 'Community' }).click(); await page.waitForTimeout(800)
  console.log('after in-app nav', await pos(), await page.locator('[data-object="friend"]').getAttribute('transform'))
  await page.reload(); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(1000)
  console.log('after reload', await pos(), await page.locator('[data-object="friend"]').getAttribute('transform'))
  await shot(`${run}/screenshots/home/community-${tag}-after-reload.png`)
  console.log('problems', problems.filter(p => !p.includes('status of 404')))
} finally { await close() }
