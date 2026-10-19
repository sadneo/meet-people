import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'

const run = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700'
const id = 'ab955825-dc9e-4c0f-9dbd-5128ae3a4a03'
for (const [trial, width, height] of [[1, 390, 844], [2, 1280, 860]]) {
  const X = await openAs('dave', { width, height })
  try {
    await X.page.route(`**/api/events/${id}`, route => route.fulfill({ status: 502, contentType: 'text/html', body: '<html><body>Bad gateway</body></html>' }))
    await X.page.goto(`/events/${id}`)
    await X.page.getByRole('alert').waitFor()
    await X.page.waitForTimeout(700)
    console.log(JSON.stringify({ trial, width, alert: await X.page.getByRole('alert').innerText(), retryVisible: await X.page.getByRole('button', { name: 'Retry', exact: true }).isVisible(), problems: X.problems.filter(p => !p.includes('favicon')) }))
    await X.shot(`${run}/screenshots/EVENTS-01-recovered-${trial}-${width}.png`)
    await X.page.route(`**/api/events/${id}`, route => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'This event is no longer available.' }) }))
    await X.page.getByRole('button', { name: 'Retry', exact: true }).click()
    await X.page.waitForTimeout(300)
    console.log(JSON.stringify({ trial, retryResponse: await X.page.getByRole('alert').innerText() }))
  } finally { await X.close() }
}
