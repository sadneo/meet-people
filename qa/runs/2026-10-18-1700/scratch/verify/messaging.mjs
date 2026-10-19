import assert from 'node:assert/strict'
import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const run = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700'
await Promise.all([390, 1280].map(async width => {
  const X = await openAs('alice', { width, height: width === 390 ? 844 : 860 })
  try {
    const page = X.page
    await page.goto('/messages')
    await page.getByRole('button', { name: /Bob/ }).first().click()
    const box = page.getByRole('textbox', { name: 'Message', exact: true })
    await box.waitFor()
    await page.waitForTimeout(700)
    const id = new URL(page.url()).searchParams.get('conversation')
    const draft = `Verification preserved draft ${width}`
    await box.fill(draft)
    await page.route(`**/api/conversations/${id}/messages`, r => r.request().method() === 'POST' ? r.abort() : r.continue())
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await page.getByRole('alert').waitFor()
    const error = await page.getByRole('alert').innerText()
    assert.match(error, /Could not send your message/)
    assert.match(error, /Your draft is kept; retry Send/)
    assert.doesNotMatch(error, /Failed to fetch/)
    assert.equal(await box.inputValue(), draft)
    await X.shot(`${run}/screenshots/KNOWN-4-after-${width}.png`)
    console.log(JSON.stringify({ id: 'KNOWN-4', width, error, draftKept: true, expectedFailure: 'Aborted POST only; no message write' }))
    await page.unroute(`**/api/conversations/${id}/messages`)
    await page.route('**/api/conversations?page=1', async r => {
      const response = await r.fetch(), data = await response.json()
      await r.fulfill({ json: { ...data, conversations: data.conversations.filter(c => c.id !== id) } })
    })
    await page.route(`**/api/conversations/${id}/messages?after=*`, r => r.fulfill({ status: 403, json: { error: 'You are not in this conversation.' } }))
    const denied = page.waitForResponse(r => r.url().includes(`/api/conversations/${id}/messages?after=`) && r.status() === 403, { timeout: 45000 })
    await denied
    await page.waitForTimeout(700)
    assert.equal(await box.isDisabled(), true)
    assert.match(await page.locator('.pt-messaging-closed').innerText(), /can’t send messages/)
    assert.equal(await page.locator('.pt-conversations .pt-conversation').filter({ hasText: /Bob/ }).count(), 0)
    await X.shot(`${run}/screenshots/KNOWN-1-after-${width}.png`)
    console.log(JSON.stringify({ id: 'KNOWN-1', width, composerDisabled: true, removedFromInbox: true, expectedFailure: 'Injected history 403 and removed inbox row', problems: X.problems }))
    assert.equal(X.problems.filter(p => p.startsWith('page error:')).length, 0)
  } finally { await X.close() }

  const Y = await openAs('alice', { width, height: width === 390 ? 844 : 860 })
  try {
    await Y.page.goto('/messages')
    await Y.page.getByRole('button', { name: /Bob/ }).first().waitFor()
    await Y.page.waitForTimeout(700)
    await Y.page.route('**/api/conversations?page=1', async r => {
      const response = await r.fetch(), data = await response.json()
      await r.fulfill({ json: { ...data, conversations: data.conversations.filter(c => !c.participants.some(p => p.display_name.includes('Bob'))) } })
    })
    const polled = Y.page.waitForResponse(r => r.url().endsWith('/api/conversations?page=1'), { timeout: 45000 })
    await polled
    await Y.page.waitForTimeout(700)
    assert.equal(await Y.page.locator('.pt-conversations .pt-conversation').filter({ hasText: /Bob/ }).count(), 0)
    await Y.shot(`${run}/screenshots/KNOWN-2-after-${width}.png`)
    assert.equal(Y.problems.filter(p => p.startsWith('page error:')).length, 0)
    console.log(JSON.stringify({ id: 'KNOWN-2', width, removedAfterPoll: true, problems: Y.problems }))
  } finally { await Y.close() }

  const Z = await openAs('alice', { width, height: width === 390 ? 844 : 860 })
  try {
    await Z.page.goto('/messages')
    await Z.page.getByRole('button', { name: /Bob/ }).first().click()
    await Z.page.getByLabel('Message', { exact: true }).waitFor()
    await Z.page.waitForTimeout(700)
    const id = new URL(Z.page.url()).searchParams.get('conversation')
    const marker = 'Verification incoming preview'
    let supplied = false
    await Z.page.route(`**/api/conversations/${id}/messages?after=*`, async r => {
      const response = await r.fetch(), data = await response.json()
      const after = Number(new URL(r.request().url()).searchParams.get('after'))
      const messages = supplied ? [] : [{ id: crypto.randomUUID(), conversation_id: id, seq: after + 1, sender_id: data.participants.find(p => p.display_name.includes('Bob')).id, body: marker, created_at: new Date().toISOString() }]
      supplied = true
      await r.fulfill({ json: { ...data, messages } })
    })
    await Z.page.route(`**/api/conversations/${id}/read`, r => r.fulfill({ json: { lastReadSeq: r.request().postDataJSON().seq } }))
    const delivered = Z.page.waitForResponse(r => r.url().includes(`/api/conversations/${id}/messages?after=`), { timeout: 45000 })
    await delivered
    await Z.page.locator('.pt-chat-bubble').filter({ hasText: marker }).waitFor()
    assert.equal(await Z.page.locator('.pt-conversations .pt-conversation').filter({ hasText: /Bob/ }).filter({ hasText: marker }).count(), 1)
    await Z.shot(`${run}/screenshots/KNOWN-3-after-${width}.png`)
    assert.equal(Z.problems.filter(p => p.startsWith('page error:')).length, 0)
    console.log(JSON.stringify({ id: 'KNOWN-3', width, previewUpdatedWithChat: true, fixture: 'Injected incoming message and read receipt; no message database write', problems: Z.problems }))
  } finally { await Z.close() }
}))
