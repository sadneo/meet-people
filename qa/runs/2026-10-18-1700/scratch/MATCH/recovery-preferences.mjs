import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'

const run = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700'
for (const [trial, width, height] of [[1, 390, 844], [2, 1280, 860]]) {
  const X = await openAs('carol', { width, height })
  try {
    await X.page.goto('/matchmaking')
    await X.page.getByRole('button', { name: 'Preferences', exact: true }).click()
    await X.page.getByRole('button', { name: 'Add time window' }).click()
    const start = X.page.getByRole('textbox', { name: /^Start \d+$/ }).last()
    const end = X.page.getByRole('textbox', { name: /^End \d+$/ }).last()
    await start.fill('17:00')
    await end.fill('21:00')
    await X.page.getByRole('button', { name: 'Save preferences' }).click()
    await X.page.waitForTimeout(400)
    const metrics = await X.page.evaluate(() => {
      const alert = document.querySelector('dialog[open] [role="alert"]')
      const body = document.querySelector('.match-preferences-body')
      const a = alert?.getBoundingClientRect(), b = body?.getBoundingClientRect()
      return { error: alert?.textContent, alertTop: a?.top, alertBottom: a?.bottom, scrollViewportTop: b?.top, scrollViewportBottom: b?.bottom, visible: a && b ? a.top < b.bottom && a.bottom > b.top : null, focused: document.activeElement?.textContent, scrollTop: body?.scrollTop }
    })
    console.log(JSON.stringify({ trial, width, metrics }))
    await X.shot(`${run}/screenshots/MATCH-01-recovered-${trial}-${width}.png`)
    await X.page.getByRole('button', { name: 'Cancel', exact: true }).click()
    console.log(JSON.stringify({ trial, persisted: 'No save request submitted: client validation rejected input.', problems: X.problems.filter(p => !p.includes('favicon')) }))
  } finally { await X.close() }
}
