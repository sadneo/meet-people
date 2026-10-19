// Guest -> Quick sign in (local only) -> profile gating -> save a profile -> start matching.
import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const S = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots/'
const tag = process.argv[2] ?? 'a'
const X = await openAs('guest', { width: 390, height: 844 })
const main = async () => X.page.locator('main').ariaSnapshot()
await X.page.goto('/matchmaking'); await X.page.waitForTimeout(2000)
console.log('sign in href:', await X.page.getByRole('link', { name: 'Sign in' }).getAttribute('href'))
await X.page.getByRole('button', { name: 'Quick sign in (local only)' }).click(); await X.page.waitForTimeout(4000)
console.log('after quick sign in:\n' + await main())
await X.shot(S + `MATCH-anon-${tag}-noprofile-390.png`)
console.log('url:', X.page.url())
const start = X.page.getByRole('button', { name: 'Start matching' })
if (await start.count()) { console.log('start disabled:', await start.isDisabled()) }
// open preferences, fill minimum, save
await X.page.getByRole('button', { name: 'Preferences' }).click(); await X.page.waitForTimeout(800)
await X.page.getByLabel('Username').fill(`qa-match-${Date.now()}`)
await X.page.getByLabel('Display name').fill('QA Match Anon')
await X.page.getByRole('button', { name: 'Save preferences' }).click(); await X.page.waitForTimeout(3000)
console.log('dialog open after save:', await X.page.locator('dialog[open]').count())
console.log(await main())
await X.shot(S + `MATCH-anon-${tag}-saved-390.png`)
console.log(X.problems.join('\n'))
await X.close()
