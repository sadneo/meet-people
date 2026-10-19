// Fake a long conversation (network intercept only, nothing is sent) and check chat/inbox layout.
import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
import { auditPage, coveredAtBottom } from './audit-lib.mjs'
const RUN = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700'
const CID = '17a7b258-e2ec-4f3d-864a-d112fe3ceb70'
const FRANK = '66666666-6666-4666-8666-666666666666', LIAM = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const sizes = (process.argv[2] ?? '320x568,390x844,768x1024,1280x800,1920x1080').split(',')
const longName = 'Frank Alexander Montgomery-Llewellyn the Third of Somewhere Very Far Away'
const bodies = [
  'hey!',
  'https://example.com/a/really/long/link/without/any/spaces/that/should/wrap/inside/the/bubble/and/not/push/the/layout/sideways/0123456789abcdefghij',
  'Supercalifragilisticexpialidocious'.repeat(4),
  'A normal sentence that is long enough to wrap onto a couple of lines in the chat bubble on a narrow phone screen.',
  'ok',
  'Line one\nLine two\nLine three',
]
const messages = Array.from({ length: 30 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, conversation_id: CID, seq: i + 1, sender_id: i % 2 ? LIAM : FRANK, body: bodies[i % bodies.length], created_at: new Date(Date.now() - (30 - i) * 60000).toISOString() }))
const participants = [{ id: FRANK, display_name: longName, avatar_url: null, last_read_seq: 30 }, { id: LIAM, display_name: 'Liam Chen', avatar_url: null, last_read_seq: 30 }]
for (const size of sizes) {
  const [width, height] = size.split('x').map(Number)
  const { page, problems, close } = await openAs('liam', { width, height })
  await page.route('**/api/conversations**', async route => {
    const req = route.request(); const url = new URL(req.url())
    if (req.method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ lastReadSeq: 30 }) })
    if (url.pathname.endsWith('/messages')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ kind: 'direct', canSend: true, messages, participants, nextCursor: null }) })
    if (url.pathname === '/api/conversations') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ conversations: [{ id: CID, kind: 'direct', created_at: messages[0].created_at, participants, latest_message: messages[1], unread_count: 3 }], hasMore: false }) })
    return route.continue()
  })
  await page.route('**/api/connections**', route => route.request().method() === 'GET' ? route.continue() : route.abort())
  await page.goto(`/messages/chat?conversation=${CID}`)
  await page.waitForTimeout(3000)
  const a = await page.evaluate(auditPage)
  await page.screenshot({ path: `${RUN}/screenshots/MOBILE-chat-long-${width}.png` })
  const cov = await page.evaluate(coveredAtBottom)
  const comp = await page.evaluate(() => { const i = document.querySelector('input[aria-label="Message"], .pt-composer-field input'); const r = i?.getBoundingClientRect(); const n = document.querySelector('.pt-bottom-nav'); const nr = n?.getBoundingClientRect(); return { composer: r && [Math.round(r.top), Math.round(r.bottom)], nav: nr && getComputedStyle(n).display !== 'none' ? Math.round(nr.top) : null, docH: document.documentElement.scrollHeight, vh: innerHeight } })
  await page.screenshot({ path: `${RUN}/scratch/MOBILE/out/chat-long-bottom-${width}.png` })
  console.log(size, 'overflow', a.overflow, a.scrollWidth, 'overRight', JSON.stringify(a.overRight.slice(0, 4)), 'covered', JSON.stringify(cov.covered.slice(0, 3)), JSON.stringify(comp))
  console.log('  problems', problems.filter(p => !p.includes('404')).join(' | '))
  // inbox
  await page.goto('/messages'); await page.waitForTimeout(2500)
  const b = await page.evaluate(auditPage)
  await page.screenshot({ path: `${RUN}/screenshots/MOBILE-inbox-long-${width}.png` })
  console.log('  inbox overflow', b.overflow, JSON.stringify(b.overRight.slice(0, 4)))
  await close()
}
