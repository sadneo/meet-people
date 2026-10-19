import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const RUN = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700'
const CID = '17a7b258-e2ec-4f3d-864a-d112fe3ceb70'
const FRANK = '66666666-6666-4666-8666-666666666666', LIAM = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const bodies = ['https://example.com/a/really/long/link/without/any/spaces/that/should/wrap/inside/the/bubble/and/not/push/the/layout/sideways/0123456789abcdefghij', 'Supercalifragilisticexpialidocious'.repeat(4), 'short']
const messages = Array.from({ length: 6 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, conversation_id: CID, seq: i + 1, sender_id: i % 2 ? LIAM : FRANK, body: bodies[i % 3], created_at: new Date(Date.now() - (30 - i) * 60000).toISOString() }))
const participants = [{ id: FRANK, display_name: 'Frank Lee', avatar_url: null, last_read_seq: 6 }, { id: LIAM, display_name: 'Liam Chen', avatar_url: null, last_read_seq: 6 }]
const [width, height] = (process.argv[2] ?? '320x568').split('x').map(Number)
const { page, close } = await openAs('liam', { width, height })
await page.route('**/api/conversations**', async route => {
  const req = route.request(); const url = new URL(req.url())
  if (req.method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ lastReadSeq: 6 }) })
  if (url.pathname.endsWith('/messages')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ kind: 'direct', canSend: true, messages, participants, nextCursor: null }) })
  return route.continue()
})
await page.goto(`/messages/chat?conversation=${CID}`); await page.waitForTimeout(2500)
const info = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > innerWidth + 1 }).slice(0, 5).map(e => e.className + ' ' + Math.round(e.getBoundingClientRect().right)))
console.log('beyond right', info)
// scroll message pane to top
await page.evaluate(() => { for (const el of document.querySelectorAll('*')) { const s = getComputedStyle(el); if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) el.scrollTop = 0 } })
await page.waitForTimeout(300)
await page.screenshot({ path: `${RUN}/scratch/MOBILE/out/chat-longwords-${width}.png` })
await close()
