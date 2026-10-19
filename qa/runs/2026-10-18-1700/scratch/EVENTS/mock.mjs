import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
import { readFileSync } from 'node:fs'
const R = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots'
const user = process.argv[2] ?? 'dave'
const [w, h] = (process.argv[3] ?? '390x844').split('x').map(Number)
const base = { description: null, category: null, ends_at: null, location_name: null, address: null, city: null, image_url: null, source: 'qa', source_url: null, status: 'active', distance_miles: null, interested_count: 0 }
const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '44444444-aaaa-4aaa-8aaa-444444444444']
const events = [
  { ...base, id: ids[0], title: 'Supercalifragilisticexpialidociousandevenlongerwordwithoutanyspacesatallforlayouttesting', category: 'Music', starts_at: '2026-10-24T22:00:00Z', ends_at: '2026-10-26T18:00:00Z', location_name: 'The Extremely Long Venue Name Hall of the Department of Interdisciplinary Studies, Building 42, Room 1001', image_url: 'https://example.invalid/broken.jpg', description: 'Line one.\nLine two.\n' + 'Long description '.repeat(80) },
  { ...base, id: ids[1], title: 'Food truck night with a very long title that wraps over several lines on a phone screen to see what happens to the card layout', category: 'Food', starts_at: '2026-10-25T23:00:00Z', ends_at: '2026-10-26T02:00:00Z', city: 'Ann Arbor', image_url: 'https://img.test/tall.png', source_url: 'https://example.com/listing', address: '123 Main St, Ann Arbor, MI 48104' },
  { ...base, id: ids[2], title: 'Ongoing exhibit', category: 'Arts & Culture', starts_at: '2026-10-01T15:00:00Z', ends_at: '2026-12-01T22:00:00Z', image_url: 'javascript:alert(1)', interested_count: 1, source_url: 'javascript:alert(1)' },
  { ...base, id: ids[3], title: 'No date event', starts_at: null, interested_count: 12 },
]
const { page, problems, close } = await openAs(user, { width: w, height: h })
const png = readFileSync('/home/xqiu/Projects/meet-people/public/prototype/music.jpg')
await page.route('https://img.test/**', r => r.fulfill({ status: 200, contentType: 'image/jpeg', body: png }))
await page.route('**/api/events?*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events, categories: ['Arts & Culture', 'Food', 'Music'], page: 1, hasMore: true }) }))
for (const e of events) await page.route(`**/api/events/${e.id}`, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(e) }))
await page.route('**/group-queue', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ state: 'idle', proposal: null }) }))
await page.goto('/events'); await page.waitForTimeout(2500)
console.log('overflow', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth))
console.log((await page.locator('main').innerText()).replace(/\n+/g, ' | '))
await page.screenshot({ path: `${R}/EVENTS-mock-list-${w}.png`, fullPage: true })
for (const [i, e] of events.entries()) {
  await page.goto(`/events/${e.id}`); await page.waitForTimeout(2000)
  console.log(`--- detail ${i}: overflow`, await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth))
  console.log((await page.locator('article').innerText()).replace(/\n+/g, ' | ').slice(0, 500))
  await page.screenshot({ path: `${R}/EVENTS-mock-detail-${i}-${w}.png`, fullPage: true })
}
console.log('problems', problems.filter(p => !p.includes('favicon')))
await close()
