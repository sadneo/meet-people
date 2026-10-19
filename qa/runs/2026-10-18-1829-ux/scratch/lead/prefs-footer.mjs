import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
for (const width of [320, 390]) {
  const X = await openAs('carol', { width, height: 568 })
  try {
    await X.page.goto('/matchmaking')
    await X.page.getByRole('button', { name: 'Preferences', exact: true }).click()
    console.log(width, JSON.stringify(await X.page.locator('dialog[open]').evaluate(d => {
      const f = d.querySelector('footer'), cs = getComputedStyle(f)
      return { dialog: d.clientWidth, footerPad: cs.padding, gap: cs.columnGap, buttons: [...f.querySelectorAll('button')].map(b => ({ w: Math.round(b.getBoundingClientRect().width), pad: getComputedStyle(b).padding, font: getComputedStyle(b).fontSize })) }
    })))
  } finally { await X.close() }
}
