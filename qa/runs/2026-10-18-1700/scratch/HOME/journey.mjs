import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const run = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700'
const user = process.argv[2] ?? 'guest'
const [width, height] = (process.argv[3] ?? '390x844').split('x').map(Number)
const tag = `${user}-${width}`
const { page, problems, shot, close } = await openAs(user, { width, height })
const path = () => page.url().replace('http://127.0.0.1:3000', '')
try {
  await page.goto('/'); await page.waitForLoadState('networkidle').catch(() => {})
  const bubbles = await page.locator('.pt-thought-bubble').allInnerTexts()
  console.log('bubbles', bubbles)
  // Open second bubble
  await page.locator('.pt-thought-bubble').nth(1).click()
  await page.waitForTimeout(500)
  console.log('after bubble click', path(), await page.locator('h1').allInnerTexts())
  await shot(`${run}/screenshots/home/journey-${tag}-person.png`)
  // Back arrow on profile header
  await page.getByRole('button', { name: /back/i }).first().click()
  await page.waitForTimeout(500)
  console.log('after header back arrow', path(), await page.locator('h1').allInnerTexts())
  await shot(`${run}/screenshots/home/journey-${tag}-after-back.png`)
  // Browser back twice
  await page.goBack(); await page.waitForTimeout(400)
  console.log('browser back ->', path(), await page.locator('h1').allInnerTexts())
  await page.goBack(); await page.waitForTimeout(400)
  console.log('browser back ->', path(), await page.locator('h1').allInnerTexts())
  // Reload on /profile/person after selecting a non-default person
  await page.goto('/'); await page.waitForLoadState('networkidle').catch(() => {})
  await page.locator('.pt-thought-bubble').nth(1).click(); await page.waitForTimeout(400)
  console.log('selected person', await page.locator('h1').allInnerTexts())
  await page.reload(); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(500)
  console.log('after reload', path(), await page.locator('h1').allInnerTexts())
  await shot(`${run}/screenshots/home/journey-${tag}-person-reload.png`)
  console.log('problems', problems.filter(p => !p.includes('favicon') && !p.includes('Failed to load resource: the server responded with a status of 404')))
} finally { await close() }
