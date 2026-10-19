import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const run = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700'
const user = process.argv[2] ?? 'guest'
const route = process.argv[3] ?? '/'
const sizes = (process.argv[4] ?? '375x667,320x568,844x390,521x900,800x900,801x900,1280x720,1920x1080').split(',')
for (const size of sizes) {
  const [width, height] = size.split('x').map(Number)
  const { page, problems, close } = await openAs(user, { width, height })
  await page.goto(route); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(1000)
  // detect overlaps between bubbles, pebble button, h1, find people, toolbar, nav
  const info = await page.evaluate(() => {
    const r = el => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), r: Math.round(b.right), b: Math.round(b.bottom) } }
    const els = { bubbles: [...document.querySelectorAll('.pt-thought-bubble')].map(r), pebble: r(document.querySelector('.pt-pebble-refresh')), h1: r(document.querySelector('main h1')), find: r(document.querySelector('.pt-discovery-action')), downtime: r(document.querySelector('.pt-focus-secondary a')), community: r(document.querySelector('.pt-home-community')), balance: r(document.querySelector('.pt-calm-balance')), bell: r(document.querySelector('.pt-inbox-controls button')), bottomNav: r(document.querySelector('.pt-bottom-nav')) }
    const overlap = (a, b) => a && b && a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b
    const list = Object.entries(els).flatMap(([k, v]) => Array.isArray(v) ? v.map((x, i) => [`${k}${i}`, x]) : [[k, v]]).filter(([, v]) => v && v.w > 0)
    const hits = []
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (overlap(list[i][1], list[j][1])) hits.push(`${list[i][0]}x${list[j][0]}`)
    const navVisible = getComputedStyle(document.querySelector('.pt-bottom-nav')).display !== 'none'
    return { hits, navVisible, scrollH: document.documentElement.scrollHeight, innerH: innerHeight, scrollW: document.documentElement.scrollWidth, innerW: innerWidth, find: els.find, downtime: els.downtime, nav: els.bottomNav }
  })
  const name = `${run}/screenshots/home/sizes-${user}-${route.replace(/\//g, '_')}-${size}.png`
  await page.screenshot({ path: name })
  console.log(size, JSON.stringify(info), problems.filter(p => !p.includes('status of 404')).join(' | '))
  await close()
}
