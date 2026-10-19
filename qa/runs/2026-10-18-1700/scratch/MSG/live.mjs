import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const A = await openAs('alice', { width: 1280, height: 860 })
await A.page.goto('/messages')
await A.page.getByRole('button', { name: /Erin/ }).waitFor()
// Watch for the live region appearing and record what text is inserted into it after it exists
await A.page.evaluate(() => {
  window.__live = []
  const watch = region => new MutationObserver(records => { for (const r of records) for (const n of r.addedNodes) window.__live.push((n.textContent || '').slice(0, 60)) }).observe(region, { childList: true, subtree: true, characterData: true })
  new MutationObserver(() => { const r = document.querySelector('[aria-live]'); if (r && !r.__w) { r.__w = 1; window.__liveInitial = r.textContent; watch(r) } }).observe(document.body, { childList: true, subtree: true })
})
await A.page.getByRole('button', { name: /Erin/ }).click()
await A.page.waitForTimeout(2500)
const live = await A.page.evaluate(() => ({ initial: window.__liveInitial, added: window.__live.length, chars: window.__live.join('').length, sample: window.__live.slice(0, 4) }))
console.log('live region at creation:', JSON.stringify(live.initial), '| nodes added after:', live.added, '| text chars added:', live.chars)
console.log('sample:', live.sample)
console.log('live attrs:', await A.page.locator('[aria-live]').evaluate(e => `${e.tagName} aria-live=${e.getAttribute('aria-live')} aria-label=${e.getAttribute('aria-label')}`))
await A.page.evaluate(() => { window.__live = [] })
await A.page.getByRole('button', { name: 'Load earlier messages' }).click(); await A.page.waitForTimeout(1500)
console.log('after Load earlier: nodes added', await A.page.evaluate(() => window.__live.length), 'chars', await A.page.evaluate(() => window.__live.join('').length))
await A.close()
