// Read-only Chromium verification: messaging responses are intercepted locally.
import { writeFileSync } from 'node:fs'
import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'

const results = []
for (const width of [390, 1280]) {
  for (const scenario of ['preview-order', 'closed-composer']) {
    const { page, close } = await openAs('alice', { width, height: width === 390 ? 844 : 860 })
    try {
      await page.goto('/profile')
      await page.getByRole('button', { name: 'Edit profile', exact: true }).waitFor()
      const me = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(key => key.endsWith('-auth-token')))).user.id)
      const id = 'c0000000-0000-4000-8000-000000000001'
      const members = [
        { id: me, display_name: 'QA Alice', avatar_url: null, last_read_seq: 0 },
        { id: 'a0000000-0000-4000-8000-000000000002', display_name: 'QA Taylor', avatar_url: null, last_read_seq: 0 },
      ]
      const first = { id: 'b0000000-0000-4000-8000-000000000001', conversation_id: id, seq: 1, sender_id: members[1].id, body: 'Old initial', created_at: '2026-10-18T16:00:00Z' }
      const received = { ...first, id: 'b0000000-0000-4000-8000-000000000002', seq: 2, body: 'Incoming captured before send', created_at: '2026-10-18T16:01:00Z' }
      const sent = { ...first, id: 'b0000000-0000-4000-8000-000000000003', seq: 3, sender_id: me, body: 'New sent after poll began', created_at: '2026-10-18T16:02:00Z' }
      let held = false, release, latest = first
      const history = messages => ({ kind: 'direct', canSend: true, messages, participants: members, nextCursor: null })
      await page.route('**/api/connections**', route => route.fulfill({ json: { incoming: [], sent: [], connected: [] } }))
      await page.route('**/api/conversations**', async route => {
        const request = route.request(), url = new URL(request.url())
        if (url.pathname.endsWith('/activity')) return route.fulfill({ json: { unreadConversations: 0, incomingRequests: 0 } })
        if (url.pathname.endsWith('/read')) return route.fulfill({ json: { lastReadSeq: JSON.parse(request.postData()).seq } })
        if (request.method() === 'POST') {
          if (scenario === 'closed-composer') return route.fulfill({ status: 403, json: { error: 'You are not in this conversation.' } })
          latest = sent
          return route.fulfill({ json: sent })
        }
        if (url.pathname.endsWith('/messages')) {
          if (url.searchParams.has('after')) {
            held = true
            await new Promise(resolve => { release = resolve })
            return route.fulfill({ json: history(scenario === 'preview-order' ? [received] : []) })
          }
          return route.fulfill({ json: history([first]) })
        }
        return route.fulfill({ json: { conversations: [{ id, kind: 'direct', created_at: first.created_at, participants: members, latest_message: latest, unread_count: 0 }], hasMore: false } })
      })
      await page.goto(`/messages/chat?conversation=${id}`)
      const chat = page.getByRole('region', { name: 'Message history' })
      await chat.getByText(first.body, { exact: true }).waitFor()
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
      for (let i = 0; i < 50 && !held; i++) await page.waitForTimeout(20)
      if (!held) throw new Error('Did not capture the chat poll')
      const input = page.getByLabel('Message', { exact: true })
      await input.fill(sent.body)
      await page.getByRole('button', { name: 'Send', exact: true }).click()
      const row = page.locator('.pt-inbox-pane .pt-conversation').first()
      if (scenario === 'preview-order') await row.getByText(sent.body, { exact: true }).waitFor({ state: 'attached' })
      else {
        await page.getByText('You are not in this conversation.', { exact: true }).waitFor()
        if (!await input.isDisabled()) throw new Error('403 did not disable the composer')
      }
      const pollResponse = page.waitForResponse(response => response.url().includes(`/api/conversations/${id}/messages?after=`))
      release()
      await pollResponse
      await page.waitForTimeout(150)
      if (scenario === 'preview-order') {
        const preview = await row.innerText()
        if (!preview.includes(sent.body) || preview.includes(received.body)) throw new Error('A delayed poll rolled back the sent-message preview')
        if (!await chat.getByText(sent.body, { exact: true }).count()) throw new Error('The newer sent message disappeared')
        results.push({ scenario, width, passed: true, inboxSequence: 3, newerMessageRetained: true })
      } else {
        const sendDisabled = await page.getByRole('button', { name: 'Send', exact: true }).isDisabled()
        if (!await input.isDisabled() || !sendDisabled) throw new Error('A delayed poll reopened the composer after 403')
        results.push({ scenario, width, passed: true, composerDisabled: true, sendDisabled: true })
      }
    } finally {
      await close()
    }
  }
}
writeFileSync('/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/scratch/verify/messaging-races.json', JSON.stringify({ testedAt: new Date().toISOString(), databaseWrites: 0, results }, null, 2) + '\n')
console.log(JSON.stringify(results, null, 2))
