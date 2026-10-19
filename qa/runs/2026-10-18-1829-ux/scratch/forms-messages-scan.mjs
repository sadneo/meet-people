import { mkdirSync, writeFileSync } from 'node:fs'
import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const run = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1829-ux'
mkdirSync(`${run}/screenshots`, { recursive: true })
const results = []
for (const [width, height] of [[320, 568], [390, 844], [800, 844], [801, 844], [1280, 720], [1920, 1080]]) {
  const label = `${width}x${height}`
  const profile = await openAs('grace', { width, height })
  try {
    const page = profile.page
    await page.goto('/profile')
    await page.getByRole('button', { name: 'Edit profile', exact: true }).waitFor()
    await page.screenshot({ path: `${run}/screenshots/FORMS-profile-${label}.png`, fullPage: true })
    results.push({ label, page: 'profile', data: await page.evaluate(() => {
      const rect = selector => { const element = document.querySelector(selector), r = element.getBoundingClientRect(), css = getComputedStyle(element); return { x: r.x, y: r.y, width: r.width, height: r.height, position: css.position, background: css.backgroundColor } }
      return { avatar: rect('.pt-profile-portrait .pt-avatar'), portrait: rect('.pt-profile-portrait'), summary: rect('.pt-profile-summary') }
    }) })
    await page.getByRole('button', { name: 'Edit profile', exact: true }).click()
    await page.screenshot({ path: `${run}/screenshots/FORMS-profile-dialog-${label}.png` })
    await page.getByRole('button', { name: 'Close dialog' }).click()
    await page.goto('/settings')
    await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor()
    await page.screenshot({ path: `${run}/screenshots/FORMS-settings-${label}.png`, fullPage: true })
    await page.getByLabel('Comfortable distance').scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${run}/screenshots/FORMS-settings-social-${label}.png` })
    results.push({ label, page: 'settings', data: await page.getByLabel('Comfortable distance').evaluate(element => {
      const card = element.closest('section'), cardRect = card.getBoundingClientRect(), controlRect = element.getBoundingClientRect(), fieldset = element.closest('fieldset')
      return { cardLeft: cardRect.left, controlLeft: controlRect.left, inset: controlRect.left - cardRect.left, fieldsetPadding: getComputedStyle(fieldset).padding, fieldsetMargin: getComputedStyle(fieldset).margin }
    }) })
  } finally { await profile.close() }
  const auth = await openAs('guest', { width, height })
  try {
    const page = auth.page
    await page.goto('/login')
    await page.getByLabel('Email').waitFor()
    await page.screenshot({ path: `${run}/screenshots/FORMS-login-${label}.png` })
    results.push({ label, page: 'login', data: await page.locator('.pt-auth-form a').evaluateAll(links => links.map(link => ({ text: link.textContent, color: getComputedStyle(link).color, underline: getComputedStyle(link).textDecorationLine }))) })
    await page.evaluate(() => history.replaceState({ usr: { authStep: 'register', email: 'student@example.com' }, key: 'ux-review', idx: 0 }, '', '/register'))
    await page.reload()
    await page.getByLabel('Confirm password').waitFor()
    await page.screenshot({ path: `${run}/screenshots/FORMS-register-${label}.png`, fullPage: true })
    await page.goto('/onboarding')
    const skip = page.getByRole('button', { name: 'Skip animation' })
    await skip.waitFor()
    await skip.click()
    await page.getByLabel('Display name').waitFor()
    await page.screenshot({ path: `${run}/screenshots/FORMS-onboarding-${label}.png`, fullPage: true })
  } finally { await auth.close() }
  const messages = await openAs('alice', { width, height })
  try {
    const page = messages.page
    // Opening an existing chat normally marks it read. Keep this review read-only.
    await page.route('**/api/conversations/*/read', route => route.fulfill({ json: { lastReadSeq: JSON.parse(route.request().postData()).seq } }))
    await page.goto('/messages')
    await page.getByRole('heading', { name: 'Messages', exact: true }).waitFor()
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${run}/screenshots/FORMS-inbox-${label}.png` })
    const row = page.locator('.pt-inbox-pane .pt-conversation').first()
    if (await row.count()) {
      await row.click()
      await page.getByRole('region', { name: 'Message history' }).waitFor()
      await page.waitForTimeout(250)
      await page.screenshot({ path: `${run}/screenshots/FORMS-chat-${label}.png` })
    }
    results.push({ label, page: 'messages', rows: await page.locator('.pt-inbox-pane .pt-conversation').count() })
  } finally { await messages.close() }
  console.log(label, 'captured')
}
writeFileSync(`${run}/scratch/forms-messages-scan.json`, JSON.stringify(results, null, 2) + '\n')
