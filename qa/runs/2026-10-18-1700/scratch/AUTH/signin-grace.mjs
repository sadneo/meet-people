import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const R = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots'
const { page, problems, close } = await openAs('guest', { width: 390, height: 844 })
const log = (...a) => console.log(...a)
await page.goto('/login?returnTo=%2Fsettings'); await page.waitForTimeout(1000)
await page.getByLabel('Email').fill('grace@example.com')
await page.getByRole('button', { name: 'Continue with email' }).click()
await page.getByLabel('Password', { exact: true }).waitFor({ timeout: 10000 })
log('after email step:', page.url(), await page.locator('h1').innerText())
await page.screenshot({ path: `${R}/AUTH-signin-password-step-390.png` })
// wrong password
await page.getByLabel('Password', { exact: true }).fill('wrongpassword')
await page.getByRole('button', { name: 'Sign in' }).click()
await page.locator('#auth-message').waitFor({ timeout: 10000 })
log('wrong pw msg:', await page.locator('#auth-message').innerText(), 'focused:', await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName))
log('pw value after error:', await page.getByLabel('Password', { exact: true }).inputValue())
await page.screenshot({ path: `${R}/AUTH-signin-wrong-password-390.png` })
// back button -> email step
await page.goBack(); await page.waitForTimeout(800)
log('after back:', page.url(), await page.locator('h1').innerText(), 'email field:', await page.getByLabel('Email').inputValue().catch(() => 'n/a'))
await page.goForward(); await page.waitForTimeout(800)
log('after forward:', page.url(), await page.locator('h1').innerText())
// refresh on password step
await page.reload(); await page.waitForTimeout(1500)
log('after reload:', page.url(), await page.locator('h1').innerText(), 'email shown:', await page.locator('.pt-auth-email span').innerText().catch(() => 'n/a'))
await page.screenshot({ path: `${R}/AUTH-signin-password-step-after-reload-390.png` })
if (await page.getByLabel('Password', { exact: true }).count()) {
  await page.getByLabel('Password', { exact: true }).fill('password123')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1500)
  log('after correct pw:', page.url(), await page.locator('h1').first().innerText().catch(() => ''))
  await page.screenshot({ path: `${R}/AUTH-signin-after-returnTo-390.png` })
  // back button after sign-in
  await page.goBack(); await page.waitForTimeout(1500)
  log('back after sign-in:', page.url(), await page.locator('h1').first().innerText().catch(() => ''))
}
log(problems.join('\n'))
await close()
