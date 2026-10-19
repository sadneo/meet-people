// Preferences dialog: layout, validation, save. User: carol.
import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const S = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots/'
const tag = process.argv[2] ?? 'a'
for (const [w, h] of [[390, 844], [1280, 860]]) {
  const X = await openAs('carol', { width: w, height: h })
  await X.page.goto('/matchmaking'); await X.page.waitForTimeout(2500)
  await X.page.getByRole('button', { name: 'Preferences' }).click(); await X.page.waitForTimeout(800)
  const dlg = X.page.locator('dialog[open]')
  const box = await dlg.boundingBox()
  console.log(`${w}: dialog box`, JSON.stringify(box), 'scrollable body:', await X.page.evaluate(() => { const b = document.querySelector('.match-preferences-body'); return b && [b.scrollHeight, b.clientHeight] }))
  await X.page.screenshot({ path: S + `MATCH-prefs-${tag}-open-${w}.png` })
  // footer visible?
  const save = X.page.getByRole('button', { name: 'Save preferences' })
  console.log(`${w}: save visible in viewport`, await save.isVisible(), JSON.stringify(await save.boundingBox()))
  if (w === 390) {
    // validation: bad time text
    await X.page.getByRole('button', { name: 'Add time window' }).click()
    await X.page.getByLabel('Start 1').fill('5pm')
    await save.click(); await X.page.waitForTimeout(800)
    console.log('bad time alert:', await dlg.getByRole('alert').textContent().catch(() => '(none)'))
    await X.page.screenshot({ path: S + `MATCH-prefs-${tag}-badtime-390.png` })
    // empty username -> browser native required
    await X.page.getByLabel('Start 1').fill('17:00:00')
    await X.page.getByLabel('Username').fill('')
    await save.click(); await X.page.waitForTimeout(800)
    console.log('empty username validity:', await X.page.getByLabel('Username').evaluate(e => e.validationMessage))
    await X.page.screenshot({ path: S + `MATCH-prefs-${tag}-emptyuser-390.png` })
    // Escape closes?
    await X.page.keyboard.press('Escape'); await X.page.waitForTimeout(500)
    console.log('dialog open after Escape:', await X.page.locator('dialog[open]').count())
  }
  console.log(X.problems.join('\n'))
  await X.close()
}
