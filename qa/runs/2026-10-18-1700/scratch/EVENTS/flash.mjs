import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const user = process.argv[2] ?? 'dave'
const id = process.argv[3] ?? '2ee591e9-d31b-462e-b74a-86982616a33a'
const { page, close } = await openAs(user, { width: 390, height: 844 })
await page.goto(`/events/${id}`)
await page.getByRole('region', { name: 'Event group queue' }).waitFor()
await page.waitForTimeout(2500)
await page.evaluate(() => {
  window.__log = []
  const region = document.querySelector('[aria-label="Event group queue"]')
  let shown = null
  const check = () => { const has = /matching profile/.test(region.innerText); if (has && shown === null) shown = performance.now(); if (!has && shown !== null) { window.__log.push(Math.round(performance.now() - shown)); shown = null } }
  new MutationObserver(check).observe(region, { subtree: true, childList: true, characterData: true, attributes: true })
})
for (let i = 0; i < 3; i++) { await page.getByRole('button', { name: 'Refresh queue' }).click(); await page.waitForTimeout(1500) }
// simulate tab becoming visible again (same code path as the 30s poll)
await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await page.waitForTimeout(1500)
console.log('warning visible durations (ms):', await page.evaluate(() => window.__log))
await close()
