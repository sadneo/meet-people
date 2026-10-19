import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const { page, problems, close } = await openAs('guest', { width: 1280, height: 860 })
const names = () => page.locator('.pt-thought-bubble .pt-thought-name').allInnerTexts()
try {
  await page.goto('/'); await page.waitForLoadState('networkidle').catch(() => {})
  const box = await page.getByRole('button', { name: 'Refresh people who are available now' }).boundingBox()
  const t0 = Date.now()
  for (let i = 0; i < 5; i++) { await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(60) }
  await page.waitForFunction(() => !document.querySelector('.pt-available-preview')?.classList.contains('is-thinking'), null, { timeout: 10000 })
  console.log('ms', Date.now() - t0, await names())
  await page.waitForTimeout(2500)
  console.log('2.5s later', await names(), await page.locator('.pt-available-preview').getAttribute('class'))
  // click bubble while thinking (force)
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(200)
  const b = await page.locator('.pt-thought-bubble').first().boundingBox()
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(300)
  console.log('clicked bubble while thinking ->', page.url())
  console.log(problems.filter(p => !p.includes('status of 404')))
} finally { await close() }
