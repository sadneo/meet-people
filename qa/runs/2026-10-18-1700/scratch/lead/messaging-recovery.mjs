import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const run = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700'
async function check(width) {
  const app = await openAs('alice', { width, height: 844 })
  const { page } = app
  try {
    await page.goto('/messages')
    await page.getByRole('button', { name: /Bob/ }).first().click()
    const box = page.getByRole('textbox', { name: 'Message', exact: true })
    await box.waitFor()
    await page.waitForTimeout(1000)
    const id = new URL(page.url()).searchParams.get('conversation')
    await page.clock.install()
    const draft = `QA recovery draft ${width}`
    await box.fill(draft)
    await page.route(`**/api/conversations/${id}/messages`, r => r.request().method() === 'POST' ? r.abort() : r.continue())
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await page.getByRole('alert').waitFor()
    console.log(JSON.stringify({ width, test: 'KNOWN-4', alert: await page.getByRole('alert').allTextContents(), draft: await box.inputValue() }))
    await app.shot(`${run}/screenshots/KNOWN-4-before-${width}.png`)
    await page.unroute(`**/api/conversations/${id}/messages`)
    await page.route('**/api/conversations?page=1', async route => {
      const response = await route.fetch()
      const data = await response.json()
      await route.fulfill({ json: { ...data, conversations: data.conversations.filter(item => item.id !== id) } })
    })
    await page.route(`**/api/conversations/${id}/messages?after=*`, r => r.fulfill({ status: 403, json: { error: 'You are not in this conversation.' } }))
    const denied = page.waitForResponse(r => r.url().includes(`/api/conversations/${id}/messages?after=`) && r.status() === 403)
    await page.clock.fastForward(31000)
    await denied
    await page.waitForTimeout(600)
    console.log(JSON.stringify({ width, test: 'KNOWN-1/2', composerEnabled: await box.isEnabled(), stillListed: await page.locator('.pt-conversations').getByRole('button', { name: /Bob/ }).count(), alerts: await page.getByRole('alert').allTextContents(), closedNotice: await page.locator('.pt-messaging-closed').allTextContents() }))
    await app.shot(`${run}/screenshots/KNOWN-1-2-before-${width}.png`)
  } finally { await app.close() }
}
await Promise.all([check(390), check(1280)])
