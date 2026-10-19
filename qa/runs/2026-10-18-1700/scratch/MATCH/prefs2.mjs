// Is the validation alert visible after Save? Which time formats are accepted? User: carol (nothing is saved on invalid input).
import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const S = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots/'
const tag = process.argv[2] ?? 'a'
const [w, h] = (process.argv[3] ?? '390x844').split('x').map(Number)
const X = await openAs('carol', { width: w, height: h })
await X.page.goto('/matchmaking'); await X.page.waitForTimeout(2500)
await X.page.getByRole('button', { name: 'Preferences' }).click(); await X.page.waitForTimeout(800)
const dlg = X.page.locator('dialog[open]')
await X.page.getByRole('button', { name: 'Add time window' }).click()
const inView = async () => X.page.evaluate(() => {
  const a = document.querySelector('dialog[open] [role=alert]'); const b = document.querySelector('.match-preferences-body')
  if (!a) return 'no alert'
  const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect()
  return { alertTop: Math.round(ar.top), alertBottom: Math.round(ar.bottom), bodyVisibleTop: Math.round(br.top), bodyVisibleBottom: Math.round(br.bottom), visible: ar.top < br.bottom && ar.bottom > br.top, focused: document.activeElement?.textContent?.slice(0, 40) }
})
for (const value of ['17:00', '5:00 PM', '17:00:00']) {
  await X.page.getByLabel('Start 1').fill(value)
  await X.page.getByLabel('End 1').fill(value === '17:00:00' ? '21:00:00' : value === '17:00' ? '21:00' : '9:00 PM')
  await X.page.getByRole('button', { name: 'Save preferences' }).click(); await X.page.waitForTimeout(1200)
  const open = await X.page.locator('dialog[open]').count()
  console.log(`value ${value}: dialog open=${open}`, open ? JSON.stringify(await inView()) : '(saved)')
  if (open) await X.page.screenshot({ path: S + `MATCH-prefs2-${tag}-${value.replace(/[^0-9a-zA-Z]/g, '')}-${w}.png` })
  if (!open) break
}
console.log(X.problems.join('\n'))
await X.close()
