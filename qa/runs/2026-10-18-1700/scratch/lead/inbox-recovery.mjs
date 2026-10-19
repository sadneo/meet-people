import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const run = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700'
for (const width of [390,1280]) {
  const X = await openAs('alice',{width,height:844})
  try {
    await X.page.goto('/messages')
    await X.page.getByRole('button',{name:/Bob/}).first().waitFor()
    await X.page.clock.install()
    await X.page.route('**/api/conversations?page=1', async r => {
      const response = await r.fetch(); const data = await response.json()
      await r.fulfill({json:{...data,conversations:data.conversations.filter(c=>!c.participants.some(p=>p.display_name.includes('Bob')))}})
    })
    const polled = X.page.waitForResponse(r=>r.url().endsWith('/api/conversations?page=1'))
    await X.page.clock.fastForward(31000); await polled; await X.page.waitForTimeout(700)
    console.log(JSON.stringify({width,test:'KNOWN-2',stillListed:await X.page.locator('.pt-conversations').getByRole('button',{name:/Bob/}).count()}))
    await X.shot(`${run}/screenshots/KNOWN-2-before-${width}.png`)
  } finally { await X.close() }
  const Y = await openAs('alice',{width,height:844})
  try {
    await Y.page.goto('/messages'); await Y.page.getByRole('button',{name:/Bob/}).first().click()
    await Y.page.getByLabel('Message',{exact:true}).waitFor()
    await Y.page.waitForTimeout(700)
    const id = new URL(Y.page.url()).searchParams.get('conversation')
    await Y.page.clock.install()
    const marker='QA fresh incoming message'
    await Y.page.route(`**/api/conversations/${id}/messages?after=*`,async r=>{
      const response=await r.fetch(); const data=await response.json()
      const after=Number(new URL(r.request().url()).searchParams.get('after'))
      await r.fulfill({json:{...data,messages:[{id:crypto.randomUUID(),conversation_id:id,seq:after+1,sender_id:data.participants.find(p=>p.display_name.includes('Bob')).id,body:marker,created_at:new Date().toISOString()}]}})
    })
    await Y.page.route(`**/api/conversations/${id}/read`,r=>r.fulfill({json:{lastReadSeq:r.request().postDataJSON().seq}}))
    await Y.page.clock.fastForward(5100)
    await Y.page.locator('.pt-chat-bubble').filter({hasText:marker}).waitFor()
    console.log(JSON.stringify({width,test:'KNOWN-3',previewUpdated:await Y.page.locator('.pt-conversations').getByRole('button',{name:/Bob/}).filter({hasText:marker}).count()}))
    await Y.shot(`${run}/screenshots/KNOWN-3-before-${width}.png`)
  } finally {await Y.close()}
}
