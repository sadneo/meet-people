import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const run = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700'
const user = process.argv[2] ?? 'guest'
const [width, height] = (process.argv[3] ?? '390x844').split('x').map(Number)
const tag = `${user}-${width}`
const { page, problems, shot, close } = await openAs(user, { width, height })
const bal = () => page.locator('.pt-community-controls .pt-calm-balance strong').innerText()
try {
  await page.goto('/community'); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(800)
  console.log('balance start', await bal())
  await page.getByRole('button', { name: 'Developer controls' }).click()
  await page.getByRole('button', { name: 'Add 100 demo Pebbles' }).click()
  await page.getByRole('button', { name: 'Developer controls' }).click()
  console.log('balance after funds', await bal())
  await page.getByRole('button', { name: 'Build your community' }).click(); await page.waitForTimeout(400)
  await shot(`${run}/screenshots/home/build-${tag}-dialog.png`)
  await page.getByRole('button', { name: 'Build Garden Bench' }).click(); await page.waitForTimeout(200)
  await page.getByRole('button', { name: 'Build Wildflower Patch' }).click(); await page.waitForTimeout(200)
  await page.getByRole('button', { name: 'Close upgrades' }).click(); await page.waitForTimeout(300)
  console.log('balance after build', await bal(), 'objects', await page.locator('[data-upgrade]').evaluateAll(els => els.map(e => e.getAttribute('data-upgrade'))))
  await shot(`${run}/screenshots/home/build-${tag}-built.png`)
  await page.reload(); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(1000)
  console.log('after reload balance', await bal(), 'objects', await page.locator('[data-upgrade]').evaluateAll(els => els.map(e => e.getAttribute('data-upgrade'))))
  await shot(`${run}/screenshots/home/build-${tag}-after-reload.png`)
  await page.goto('/'); await page.waitForTimeout(800)
  console.log('home balance', await page.locator('.pt-calm-balance strong').innerText())
  console.log('problems', problems.filter(p => !p.includes('status of 404')))
} finally { await close() }
