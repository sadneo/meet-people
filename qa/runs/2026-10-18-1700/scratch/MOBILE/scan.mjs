// Usage: node scan.mjs <user> <viewport> [routes comma separated]
import { writeFileSync, mkdirSync } from 'node:fs'
import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
import { auditPage, coveredAtBottom, contrastAudit } from './audit-lib.mjs'

const RUN = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700'
const [user = 'liam', size = '390x844', list] = process.argv.slice(2)
const [width, height] = size.split('x').map(Number)
const CHAT = '/messages/chat?conversation=17a7b258-e2ec-4f3d-864a-d112fe3ceb70'
const EVENT = '/events/ab955825-dc9e-4c0f-9dbd-5128ae3a4a03'
const all = user === 'guest'
  ? ['/', '/community', '/matchmaking', '/downtime-matchmaking', '/events', EVENT, '/messages', '/profile', '/settings', '/login', '/register', '/onboarding']
  : ['/', '/community', '/matchmaking', '/downtime-matchmaking', '/events', EVENT, '/messages', CHAT, '/profile', '/settings', '/onboarding', '/login']
const routes = list ? list.split(',').map(r => r === 'CHAT' ? CHAT : r === 'EVENT' ? EVENT : r) : all
const slug = r => r === '/' ? 'home' : r.startsWith('/messages/chat') ? 'chat' : r.startsWith('/events/') ? 'event-detail' : r.slice(1).replace(/\W+/g, '-')
mkdirSync(`${RUN}/scratch/MOBILE/out`, { recursive: true })
const { page, problems, close } = await openAs(user, { width, height })
const results = {}
for (const route of routes) {
  problems.length = 0
  await page.goto(route)
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(1500)
  const a = await page.evaluate(auditPage)
  const contrast = await page.evaluate(contrastAudit)
  const file = `${RUN}/screenshots/MOBILE-scan-${user}-${slug(route)}-${width}.png`
  await page.screenshot({ path: file, fullPage: true })
  const cov = await page.evaluate(coveredAtBottom)
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${RUN}/scratch/MOBILE/out/bottom-${user}-${slug(route)}-${width}.png` })
  results[route] = { url: page.url(), ...a, contrast, ...cov, problems: [...problems].filter(p => !p.includes('favicon') && !p.includes('Failed to load resource: the server responded with a status of 404')) }
}
writeFileSync(`${RUN}/scratch/MOBILE/out/scan-${user}-${width}x${height}.json`, JSON.stringify(results, null, 2))
for (const [route, r] of Object.entries(results)) {
  console.log(`\n=== ${route} -> ${r.url.replace('http://127.0.0.1:3000', '')} (${size}) overflow=${r.overflow} sw=${r.scrollWidth} nav=${JSON.stringify(r.nav)}`)
  if (r.overRight.length) console.log('  overRight:', r.overRight.slice(0, 6).map(o => `${o.el}[${o.left}..${o.right}] "${o.text}"`).join(' | '))
  if (r.unnamed.length) console.log('  unnamed:', r.unnamed.map(u => u.html).join('\n           '))
  if (r.small.length) console.log('  small:', r.small.filter(s => !s.inlineText).map(s => `${s.el}"${s.name}" ${s.w}x${s.h}`).join(' | '))
  if (r.covered.length) console.log('  covered:', r.covered.map(c => `${c.el}"${c.text}" by ${c.by} [${c.top}-${c.bottom}]`).join(' | '))
  if (r.unreachable.length) console.log('  unreachable:', r.unreachable.map(c => `${c.el}"${c.text}" [${c.top}-${c.bottom}]`).join(' | '))
  if (r.contrast.length) console.log('  contrast:', r.contrast.map(c => `${c.el}"${c.text}" ${c.ratio}/${c.need} ${c.color} on ${c.bg}${c.disabled ? ' (disabled)' : ''}`).join('\n            '))
  if (r.problems.length) console.log('  problems:', r.problems.join(' | '))
}
await close()
