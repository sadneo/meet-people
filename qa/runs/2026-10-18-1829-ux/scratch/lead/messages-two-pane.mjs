// Read-only: mark-read requests are intercepted.
import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const out = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1829-ux/screenshots/after'
for (const [width, height] of [[801, 844], [1280, 720], [1920, 1080]]) {
  const X = await openAs('alice', { width, height })
  try {
    const { page } = X
    await page.route('**/api/conversations/*/read', route => route.fulfill({ json: { lastReadSeq: JSON.parse(route.request().postData()).seq } }))
    await page.goto('/messages')
    await page.getByRole('button', { name: 'Refresh', exact: true }).waitFor()
    await page.locator('.pt-inbox-pane .pt-conversation').first().waitFor()
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${out}/messages-inbox-${width}x${height}.png` })
    await page.locator('.pt-inbox-pane .pt-conversation').first().click()
    await page.getByRole('form', { name: 'Send message' }).waitFor()
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${out}/messages-chat-${width}x${height}.png` })
    console.log(JSON.stringify({ width, columns: await page.locator('.pt-messages-workspace').evaluate(e => getComputedStyle(e).gridTemplateColumns), details: await page.locator('.pt-chat-details').count(), overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth) }))
  } finally { await X.close() }
}
