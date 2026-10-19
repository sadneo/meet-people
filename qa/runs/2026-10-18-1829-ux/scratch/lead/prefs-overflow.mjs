import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const X = await openAs('carol', { width: 320, height: 568 })
try {
  await X.page.goto('/matchmaking')
  await X.page.getByRole('button', { name: 'Preferences', exact: true }).click()
  console.log(JSON.stringify(await X.page.locator('dialog[open]').evaluate(d => {
    const w = d.getBoundingClientRect()
    return { dialog: [d.clientWidth, d.scrollWidth, getComputedStyle(d).overflowX], wide: [...d.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > w.right + 0.5).slice(0, 8).map(e => `${e.tagName}.${e.className} ${Math.round(e.getBoundingClientRect().right)}`) }
  })))
} finally { await X.close() }
