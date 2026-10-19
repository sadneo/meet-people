// Guest-only (signed out): the sample profile's demo "Connect" is local navigation, but frank is read-only.
import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const run = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700'
const [width, height] = (process.argv[2] ?? '390x844').split('x').map(Number)
const tag = `guest-${width}`
const { page, problems, shot, close } = await openAs('guest', { width, height })
const path = () => page.url().replace('http://127.0.0.1:3000', '')
try {
  await page.goto('/'); await page.waitForLoadState('networkidle').catch(() => {})
  await page.locator('.pt-thought-bubble').nth(1).click(); await page.waitForTimeout(500)
  console.log('profile', path(), await page.locator('main h1').allInnerTexts())
  await page.getByRole('button', { name: /Connect with/ }).click(); await page.waitForTimeout(600)
  console.log('connect ->', path(), await page.locator('main h1, main h2').allInnerTexts())
  await shot(`${run}/screenshots/home/connect-${tag}-connection.png`)
  await page.getByRole('button', { name: /^Message/ }).click(); await page.waitForTimeout(2500)
  console.log('message ->', path(), await page.locator('main h1, main h2').allInnerTexts())
  console.log('main text:', (await page.locator('main').innerText()).slice(0, 400).replace(/\n+/g, ' | '))
  await shot(`${run}/screenshots/home/connect-${tag}-message.png`)
  console.log('problems', problems.filter(p => !p.includes('status of 404')))
} finally { await close() }
