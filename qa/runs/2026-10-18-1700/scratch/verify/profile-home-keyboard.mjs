import assert from 'node:assert/strict'
import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const run = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700'
for (const width of [390, 1280]) {
  const X = await openAs('grace', { width, height: width === 390 ? 844 : 860 })
  try {
    await X.page.goto('/profile')
    await X.page.getByRole('button', { name: 'Edit profile', exact: true }).click()
    const group = X.page.getByRole('group', { name: 'Edit interests', exact: true })
    for (const label of ['morning yoga', 'plant-based cooking']) assert.equal(await group.getByRole('button', { name: label, exact: true }).getAttribute('aria-pressed'), 'true')
    await group.getByRole('button', { name: 'morning yoga', exact: true }).click()
    assert.equal(await group.getByRole('button', { name: 'morning yoga', exact: true }).getAttribute('aria-pressed'), 'false')
    await X.shot(`${run}/screenshots/AUTH-02-after-${width}.png`)
    await group.getByRole('button', { name: 'morning yoga', exact: true }).click()
    await X.page.getByRole('button', { name: 'Close dialog', exact: true }).click()
    await X.page.getByRole('button', { name: 'Edit profile', exact: true }).click()
    assert.equal(await X.page.getByRole('group', { name: 'Edit interests', exact: true }).getByRole('button', { name: 'morning yoga', exact: true }).getAttribute('aria-pressed'), 'true')
    await X.page.keyboard.press('Escape')
    assert.equal(X.problems.filter(p => p.startsWith('page error:')).length, 0)
    console.log(JSON.stringify({ id: 'AUTH-02', width, savedCustomInterestsVisibleAndToggleable: true, unsavedDraftDiscarded: true, problems: X.problems }))
  } finally { await X.close() }

  const user = width === 390 ? 'guest' : 'frank'
  const Y = await openAs(user, { width, height: width === 390 ? 844 : 860 })
  try {
    await Y.page.goto('/')
    await Y.page.locator('.pt-thought-bubble').nth(1).click()
    assert.equal(new URL(Y.page.url()).pathname, '/profile/person')
    await Y.page.getByRole('button', { name: /back/i }).first().click()
    assert.equal(new URL(Y.page.url()).pathname, '/')
    await Y.page.waitForTimeout(700)
    await Y.shot(`${run}/screenshots/HOME-01-after-${width}.png`)
    await Y.page.locator('.pt-thought-bubble').nth(1).click()
    await Y.page.reload()
    await Y.page.getByRole('button', { name: /back/i }).first().click()
    assert.equal(new URL(Y.page.url()).pathname, '/')
    assert.equal(Y.problems.filter(p => p.startsWith('page error:')).length, 0)
    console.log(JSON.stringify({ id: 'HOME-01', user, width, backReturnsHome: true, returnOriginSurvivesReload: true, problems: Y.problems }))
  } finally { await Y.close() }
}

for (const route of ['/settings', '/matchmaking']) {
  const X = await openAs('liam', { width: 390, height: 844 })
  try {
    await X.page.goto(route)
    await X.page.waitForTimeout(1500)
    await X.page.evaluate(() => { window.scrollTo(0, 0); document.activeElement?.blur?.() })
    const target = route === '/settings' ? 'Mornings' : 'On this device'
    let found = false
    for (let i = 0; i < 40; i++) {
      await X.page.keyboard.press('Tab')
      const name = await X.page.evaluate(() => (document.activeElement?.innerText || '').trim())
      if (name.startsWith(target)) { found = true; break }
    }
    assert.equal(found, true)
    const info = await X.page.evaluate(() => {
      const r = document.activeElement.getBoundingClientRect(), n = document.querySelector('.pt-bottom-nav').getBoundingClientRect()
      return { top: r.top, bottom: r.bottom, navTop: n.top, visible: r.top >= 0 && r.bottom <= n.top, scrollY }
    })
    assert.equal(info.visible, true)
    await X.shot(`${run}/screenshots/MOBILE-01-after-390-${route.slice(1)}.png`)
    assert.equal(X.problems.filter(p => p.startsWith('page error:')).length, 0)
    console.log(JSON.stringify({ id: 'MOBILE-01', route, width: 390, ...info, problems: X.problems }))
  } finally { await X.close() }
}
