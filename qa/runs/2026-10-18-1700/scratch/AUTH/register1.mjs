import { openAs, latestEmailLinks } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const R = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots'
const email = 'qa-auth-1@example.com'
const { page, problems, close } = await openAs('guest', { width: 390, height: 844 })
const log = (...a) => console.log(...a)
const since = new Date()
await page.goto('/login?returnTo=%2Fevents'); await page.waitForTimeout(1000)
await page.getByLabel('Email').fill(email)
await page.getByRole('button', { name: 'Continue with email' }).click()
await page.getByLabel('Confirm password').waitFor({ timeout: 10000 })
log('register step:', page.url(), await page.locator('h1').innerText())
await page.screenshot({ path: `${R}/AUTH-register-step-390.png` })
// short password
await page.getByLabel('Password', { exact: true }).fill('short')
await page.getByLabel('Confirm password').fill('short')
await page.getByRole('button', { name: 'Create account' }).click(); await page.waitForTimeout(800)
log('short pw validity:', await page.getByLabel('Password', { exact: true }).evaluate(e => e.validationMessage), '| msg:', await page.locator('#auth-message').innerText().catch(() => 'none'))
// mismatch
await page.getByLabel('Password', { exact: true }).fill('password123')
await page.getByLabel('Confirm password').fill('password124')
await page.getByRole('button', { name: 'Create account' }).click(); await page.waitForTimeout(800)
log('mismatch msg:', await page.locator('#auth-message').innerText().catch(() => 'none'))
await page.screenshot({ path: `${R}/AUTH-register-mismatch-390.png` })
await page.getByLabel('Confirm password').fill('password123')
await page.getByRole('button', { name: 'Create account' }).click()
await page.getByText('Check your email to confirm').waitFor({ timeout: 15000 })
log('confirmation:', page.url(), await page.locator('h1').innerText(), '|', await page.locator('p[role=status]').first().innerText())
await page.screenshot({ path: `${R}/AUTH-register-confirmation-390.png` })
await page.waitForTimeout(2000)
const links = await latestEmailLinks(email, since)
log('links:', links)
const confirm = links.find(l => l.includes('verify') || l.includes('confirm')) ?? links[0]
if (confirm) {
  await page.goto(confirm); await page.waitForTimeout(4000)
  log('after confirm link:', page.url(), await page.locator('h1').first().innerText().catch(() => ''))
  await page.screenshot({ path: `${R}/AUTH-register-after-confirm-390.png` })
  await page.waitForTimeout(6000)
  log('later:', page.url(), await page.locator('h1').first().innerText().catch(() => ''))
  await page.screenshot({ path: `${R}/AUTH-register-after-confirm-later-390.png` })
}
log(problems.join('\n'))
await close()
