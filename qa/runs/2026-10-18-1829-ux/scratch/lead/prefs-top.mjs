import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const X = await openAs('carol', { width: 1280, height: 720 })
try {
  await X.page.goto('/matchmaking')
  await X.page.getByRole('button', { name: 'Preferences', exact: true }).click()
  console.log(JSON.stringify(await X.page.locator('dialog[open]').evaluate(d => {
    const r = e => { const b = e.getBoundingClientRect(), c = getComputedStyle(e); return `${e.tagName}.${e.className} y${Math.round(b.top)}-${Math.round(b.bottom)} pad:${c.padding} margin:${c.margin} rows:${c.gridTemplateRows}` }
    const body = d.querySelector('.match-preferences-body')
    return [r(d), r(d.querySelector('form')), r(d.querySelector('header')), r(body), ...[...body.children].slice(0, 3).map(r)]
  }), null, 1))
} finally { await X.close() }
