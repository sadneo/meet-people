import assert from 'node:assert/strict'
import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const run = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700'
for (const width of [390, 1280]) {
  const X = await openAs('carol', { width, height: width === 390 ? 844 : 860 })
  try {
    await X.page.goto('/matchmaking')
    await X.page.getByRole('button', { name: 'Preferences', exact: true }).click()
    await X.page.getByRole('button', { name: 'Add time window' }).click()
    await X.page.getByRole('textbox', { name: /^Start \d+$/ }).last().fill('17:00')
    await X.page.getByRole('textbox', { name: /^End \d+$/ }).last().fill('21:00')
    for (let attempt = 1; attempt <= 2; attempt++) {
      await X.page.getByRole('button', { name: 'Save preferences' }).click()
      await X.page.waitForTimeout(300)
      const info = await X.page.getByRole('dialog').getByRole('alert').evaluate(element => {
        const r = element.getBoundingClientRect(), b = element.closest('.match-preferences-body').getBoundingClientRect()
        return { focused: document.activeElement === element, top: r.top, bottom: r.bottom, bodyTop: b.top, bodyBottom: b.bottom, visible: r.top >= b.top && r.bottom <= b.bottom }
      })
      assert.equal(info.focused, true)
      assert.equal(info.visible, true)
      assert.equal(await X.page.getByRole('textbox', { name: /^Start \d+$/ }).last().inputValue(), '17:00')
      console.log(JSON.stringify({ id: 'MATCH-01', width, attempt, ...info }))
    }
    await X.shot(`${run}/screenshots/MATCH-01-after-${width}.png`)
    await X.page.keyboard.press('Escape')
    assert.equal(await X.page.getByRole('dialog').count(), 0)
    assert.equal(await X.page.getByRole('button', { name: 'Preferences', exact: true }).evaluate(e => e === document.activeElement), true)
    assert.equal(X.problems.filter(p => p.startsWith('page error:')).length, 0)
    console.log(JSON.stringify({ id: 'MATCH-01', width, problems: X.problems }))
  } finally { await X.close() }

  const Y = await openAs('dave', { width, height: width === 390 ? 844 : 860 })
  try {
    const id = 'ab955825-dc9e-4c0f-9dbd-5128ae3a4a03'
    await Y.page.route(`**/api/events/${id}`, r => r.fulfill({ status: 502, contentType: 'text/html', body: '<html><body>Bad gateway</body></html>' }))
    await Y.page.goto(`/events/${id}`)
    const alert = Y.page.getByRole('alert')
    await alert.waitFor()
    await Y.page.waitForTimeout(700)
    assert.match(await alert.innerText(), /Events are unavailable\. Try again\./)
    assert.doesNotMatch(await alert.innerText(), /JSON|Unexpected token|html/)
    await Y.shot(`${run}/screenshots/EVENTS-01-after-${width}.png`)
    await Y.page.unroute(`**/api/events/${id}`)
    await Y.page.getByRole('button', { name: 'Retry', exact: true }).click()
    await Y.page.getByRole('region', { name: 'Event group queue' }).waitFor()
    assert.equal(await Y.page.getByRole('heading', { name: 'Go together', exact: true }).count(), 1)
    await Y.page.getByRole('link', { name: 'Back to events', exact: true }).click()
    await Y.page.getByRole('link', { name: 'See event & people' }).first().waitFor()
    assert.equal(Y.problems.filter(p => p.startsWith('page error:')).length, 0)
    console.log(JSON.stringify({ id: 'EVENTS-01', width, expectedFailure: 'Injected HTML 502', retryRestoredLiveDetail: true, problems: Y.problems }))
  } finally { await Y.close() }
}
