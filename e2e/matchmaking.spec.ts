import { expect, test } from '@playwright/test'
import { browserAccount, browserProfile, mockMatchingApi, mockMatchingSession } from './matchmaking-fixture'
import type { Account } from '../shared/account'

for (const width of [320, 801, 1440]) {
  test(`saved Friends setup at ${width}: inline preferences, original mascot, keyboard preferences and manual actions`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const external: string[] = [], queueRequests: string[] = []
    await page.route('**/*', route => {
      if (new URL(route.request().url()).origin !== 'http://127.0.0.1:3194') { external.push(route.request().url()); return route.abort() }
      return route.continue()
    })
    await mockMatchingSession(page)
    await mockMatchingApi(page)
    const saved = { ...browserProfile, location_city: 'North campus', interests: ['Coffee', 'Board games\nstrategy', 'Art'], availability: [{ dow: 1, start_time: '08:00:00', end_time: '12:00:00' }, { dow: 0, start_time: '21:00:00', end_time: '24:00:00' }] }
    await page.route('**/api/matchmaking/profile', route => route.fulfill({ json: { profile: saved } }))
    let checks = 0
    await page.route('**/api/matchmaking/result', route => {
      checks++
      return route.fulfill({ json: { candidate: { id: 'a0000000-0000-4000-8000-000000000002', name: 'Taylor', avatar: null, interests: ['Coffee'], overlap: 'some', mode: 'active', meetup: null } } })
    })
    page.on('request', request => { if (/\/(queue|result)$/.test(request.url())) queueRequests.push(request.method()) })
    await page.setViewportSize({ width, height: width === 320 ? 568 : 900 })
    await page.goto('/matchmaking')
    const dashboard = page.getByRole('region', { name: 'Find your people', exact: true })
    await expect(dashboard).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(dashboard.locator('.friends-mascot')).toHaveCount(1)
    const summary = dashboard.getByRole('table', { name: 'Weekly availability', exact: true })
    await expect(dashboard.getByRole('button', { name: 'Coffee', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(summary.getByRole('button', { name: 'Monday morning, available' })).toHaveAttribute('aria-pressed', 'true')
    await expect(summary.getByRole('button', { name: 'Sunday late, available' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('link', { name: 'Dating', exact: true })).toHaveAttribute('href', '/matchmaking?view=dating')
    await expect(page.getByRole('button', { name: 'Dating', exact: true })).toHaveCount(0)
    await expect(summary.getByRole('heading', { name: 'Places', exact: true })).toHaveCount(0)
    const controls = page.getByRole('navigation', { name: 'Matching modes', exact: true })
    await expect(page.locator('.match-home a[href="/settings"]')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Downtime matchmaking', exact: true })).toHaveCount(0)
    const preferences = controls.getByRole('button', { name: 'Preferences', exact: true })
    const actions = page.locator('.match-focus-actions')
    const start = page.getByRole('button', { name: 'Find Friends', exact: true })
    await expect(start).toBeEnabled()
    for (const control of [preferences, page.getByRole('link', { name: 'Dating', exact: true }), start, page.getByRole('button', { name: 'Refresh status', exact: true })]) {
      const box = (await control.boundingBox())!
      const name = await control.getAttribute('aria-label') ?? await control.innerText()
      console.log(`Dashboard target ${width} ${name}: ${JSON.stringify(box)}`)
      expect(box.width, `${name} width at ${width}`).toBeGreaterThanOrEqual(44); expect(box.height, `${name} height at ${width}`).toBeGreaterThanOrEqual(44)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    expect(await summary.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    expect(queueRequests).toEqual([])
    await page.screenshot({ path: `worktree/matchmaking-dashboard/dashboard-${width}.png`, fullPage: true, animations: 'disabled' })
    if (width === 320) {
      await summary.evaluate(element => element.scrollIntoView({ block: 'center' }))
      await page.screenshot({ path: 'worktree/matchmaking-dashboard/dashboard-320-summary.png', animations: 'disabled' })
    }
    await preferences.focus()
    await page.keyboard.press('Enter')
    const editor = page.getByRole('dialog', { name: 'Your preferences', exact: true })
    await expect(editor).toBeVisible()
    await expect(editor.getByLabel('City or campus area')).toHaveCount(0)
    await expect(editor.getByLabel('Birthdate (optional)')).toHaveCount(0)
    await editor.getByRole('button', { name: 'Music', exact: true }).click()
    expect(queueRequests).toEqual([])
    await page.keyboard.press('Escape')
    await expect(preferences).toBeFocused()
    await expect(summary.getByRole('button', { name: 'Monday morning, available' })).toHaveAttribute('aria-pressed', 'true')
    await start.scrollIntoViewIfNeeded()
    await expect(start).toBeInViewport()
    expect(await start.evaluate(element => {
      const box = element.getBoundingClientRect()
      return element.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2))
    }), 'matching action is not covered by fixed navigation').toBe(true)
    if (width === 320) await page.screenshot({ path: 'worktree/matchmaking-dashboard/dashboard-320-actions.png', animations: 'disabled' })
    await start.focus()
    await page.keyboard.press('Enter')
    await expect(actions.getByRole('button', { name: 'Check for a match', exact: true })).toBeEnabled()
    await expect(page.locator('.friends-scene.is-searching')).toHaveCount(1)
    expect(checks).toBe(0)
    await actions.getByRole('button', { name: 'Check for a match', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Taylor', exact: true })).toBeVisible()
    expect(checks).toBe(1)
    await actions.getByRole('button', { name: 'Cancel search', exact: true }).click()
    await expect(start).toBeEnabled()
    await expect(dashboard.locator('.friends-scene:not(.is-searching)')).toHaveCount(1)
    expect(queueRequests).toEqual(['POST', 'GET', 'DELETE'])
    expect(external).toEqual([])
  })
}

for (const width of [320, 390, 801, 1440]) {
  test(`required onboarding at ${width}: real fields, weekly keyboard input, failed save and later manual queue transition`, async ({ page }) => {
    const external: string[] = [], queueRequests: string[] = [], writes: Account[] = []
    await page.route('**/*', route => {
      if (new URL(route.request().url()).origin !== 'http://127.0.0.1:3194') { external.push(route.request().url()); return route.abort() }
      return route.continue()
    })
    await mockMatchingSession(page)
    await mockMatchingApi(page)
    let fails = true
    let persisted = browserAccount({ ...browserProfile, birthdate: null, location_city: null, interests: ['Books', 'Games', 'Hiking'], availability: [] })
    await page.route('**/api/matchmaking/account', route => {
      if (route.request().method() === 'GET') return route.fulfill({ json: persisted })
      writes.push(route.request().postDataJSON())
      if (!fails) persisted = route.request().postDataJSON()
      return fails ? route.fulfill({ status: 503, json: { code: 'unavailable', error: 'Profile save unavailable.' } }) : route.fulfill({ json: persisted })
    })
    await page.route('**/api/matchmaking/profile', route => {
      if (route.request().method() === 'PUT') persisted = { ...persisted, profile: route.request().postDataJSON() }
      return route.fulfill({ json: { profile: persisted.profile } })
    })
    page.on('request', request => { if (/\/(queue|result)$/.test(request.url())) queueRequests.push(request.url()) })
    await page.setViewportSize({ width, height: width === 320 ? 568 : width === 390 ? 844 : 900 })
    await page.goto('/matchmaking')
    const workspace = page.locator('.pt-access-card')
    await expect(workspace.getByRole('heading', { name: 'Complete onboarding', exact: true })).toBeVisible()
    await expect(workspace).toBeVisible()
    await expect(workspace.getByRole('form', { name: 'Shared profile preferences', exact: true })).toBeVisible()
    await expect(workspace.getByRole('group', { name: 'Interests', exact: true })).toBeVisible()
    await expect(workspace.getByRole('group', { name: 'Weekly availability', exact: true })).toBeVisible()
    await expect(workspace.getByRole('heading', { name: 'What brings you together', exact: true })).toHaveCount(0)
    await expect(page.locator('.match-home a[href="/settings"]')).toHaveCount(0)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.locator('.pt-app')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Dating', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Dating', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Cancel search', exact: true })).toHaveCount(0)
    const save = workspace.getByRole('button', { name: 'Finish onboarding', exact: true })
    await expect(save).toBeEnabled()
    for (const label of ['Books', 'Games', 'Hiking']) await workspace.getByRole('button', { name: label, exact: true }).click()
    const storage = await page.evaluate(() => [JSON.stringify(localStorage), JSON.stringify(sessionStorage)])
    const interestInput = workspace.getByLabel('Add a matching interest')
    await expect(interestInput).toHaveCSS('resize', 'none')
    await interestInput.fill('A'.repeat(120))
    await expect(interestInput).toHaveValue('A'.repeat(120))
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    await workspace.getByRole('button', { name: 'Add interest', exact: true }).click()
    const longChip = workspace.getByRole('button', { name: 'A'.repeat(120), exact: true })
    await expect(longChip).toHaveAttribute('aria-pressed', 'true')
    expect(await longChip.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    await longChip.click()
    if (width <= 390) {
      const entry = workspace.locator('.pt-profile-interest-entry')
      const row = (await entry.boundingBox())!
      const inputBox = (await interestInput.boundingBox())!
      const addBox = (await entry.getByRole('button', { name: 'Add interest', exact: true }).boundingBox())!
      expect(inputBox.width).toBe(row.width)
      expect(addBox.width).toBe(row.width)
      expect(addBox.y).toBeGreaterThanOrEqual(inputBox.y + inputBox.height)
      expect(addBox.height).toBeGreaterThanOrEqual(44)
      console.log(`Mobile-first setup ${width}: ${JSON.stringify({ inputWidth: inputBox.width, addWidth: addBox.width, addHeight: addBox.height, resize: 'none' })}`)
    }
    await interestInput.fill('Coffee')
    await workspace.getByRole('button', { name: 'Add interest', exact: true }).click()
    await workspace.getByRole('button', { name: 'Music', exact: true }).click()
    await workspace.getByRole('button', { name: 'Art', exact: true }).click()
    await workspace.getByLabel('City or campus area', { exact: true }).fill('Explicit campus')
    await workspace.getByLabel('Birthdate', { exact: true }).fill('2001-02-03')
    const table = workspace.getByRole('table', { name: 'Weekly availability', exact: true })
    await expect(table.getByRole('columnheader')).toHaveText(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    await expect(table.getByRole('button')).toHaveCount(28)
    await table.getByRole('button', { name: 'Monday morning, not available', exact: true }).focus()
    await page.keyboard.press('Space')
    await expect(table.getByRole('button', { name: 'Monday morning, available', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('Enter')
    await expect(table.getByRole('button', { name: 'Monday morning, not available', exact: true })).toHaveAttribute('aria-pressed', 'false')
    await page.keyboard.press('Space')
    const sizes = await table.getByRole('button').evaluateAll(elements => elements.map(element => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })))
    for (const size of sizes) { expect(size.width).toBeGreaterThanOrEqual(44); expect(size.height).toBeGreaterThanOrEqual(44) }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    console.log(`Full-page setup ${width} targets: ${JSON.stringify(sizes[0])}`)
    expect(queueRequests).toEqual([])
    const composition = await workspace.evaluate(element => {
      const form = element.querySelector('form')!
      const sections = element.querySelectorAll('form > .pt-profile-interests, form > .match-setup-availability')
      const card = sections[sections.length - 1]
      const footer = element.querySelector('footer')!
      const first = sections[0].getBoundingClientRect(), second = sections[1].getBoundingClientRect()
      const headings = Array.from(sections).map(section => section.querySelector('h3')!.getBoundingClientRect().left)
      return { width: element.getBoundingClientRect().width, formColumns: getComputedStyle(form).gridTemplateColumns.split(' ').length, sectionCount: sections.length, sectionGap: second.top - first.bottom, headingOffset: Math.abs(headings[0] - headings[1]), headingInsets: Array.from(sections).map((section, index) => headings[index] - section.getBoundingClientRect().left), footerBelowCard: footer.getBoundingClientRect().top >= card.getBoundingClientRect().bottom }
    })
    expect(composition.width).toBeLessThanOrEqual(672)
    expect(composition.formColumns).toBe(1)
    expect(composition.sectionCount).toBe(2)
    expect(composition.sectionGap).toBeGreaterThanOrEqual(11.9)
    expect(composition.sectionGap).toBeLessThanOrEqual(12.1)
    expect(composition.headingOffset).toBeLessThanOrEqual(1)
    for (const inset of composition.headingInsets) expect(Math.abs(inset - 17)).toBeLessThanOrEqual(1)
    expect(composition.footerBelowCard).toBe(true)
    console.log(`Setup dashboard composition ${width}: ${JSON.stringify(composition)}`)
    await page.screenshot({ path: `worktree/matchmaking-setup/setup-${width}.png`, fullPage: true, animations: 'disabled' })
    await save.evaluate(element => element.scrollIntoView({ block: 'center' }))
    await expect(save).toBeInViewport()
    expect(await save.evaluate(element => {
      const box = element.getBoundingClientRect()
      return element.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2))
    })).toBe(true)
    await save.click()
    await expect(workspace.getByRole('alert')).toContainText('Account save could not be confirmed')
    await expect(page.getByRole('button', { name: 'Cancel search', exact: true })).toHaveCount(0)
    expect(queueRequests).toEqual([])
    expect(await page.evaluate(() => [JSON.stringify(localStorage), JSON.stringify(sessionStorage)])).toEqual(storage)
    fails = false
    await workspace.getByRole('button', { name: 'Retry account', exact: true }).click()
    await expect(save).toBeEnabled()
    await save.click()
    await expect(page.getByRole('button', { name: 'Find Friends', exact: true })).toBeEnabled()
    await expect(workspace).toHaveCount(0)
    expect(writes).toHaveLength(2)
    expect(writes[1].profile).toEqual({ ...browserProfile, birthdate: '2001-02-03', location_city: 'Explicit campus', interests: ['Coffee', 'Music', 'Art'], availability: [{ dow: 1, start_time: '08:00:00', end_time: '12:00:00' }] })
    expect(writes[1].completed).toEqual([0, 1, 2, 3])
    expect(await page.evaluate(() => localStorage.getItem('pebble.matchmaking-profile'))).toBeNull()
    expect(queueRequests).toEqual([])
    await page.getByRole('button', { name: 'Find Friends', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Cancel search', exact: true })).toBeEnabled()
    expect(queueRequests).toHaveLength(1)
    expect(queueRequests[0]).toContain('/queue')
    expect(external).toEqual([])
  })
}

for (const width of [320, 390, 1440]) {
  test(`unavailable identity at ${width}: private setup denied and safe read-only retry layout`, async ({ page }) => {
    const unexpected: string[] = [], forbidden: string[] = []
    await page.route('**/*', route => {
      if (new URL(route.request().url()).origin !== 'http://127.0.0.1:3194') { unexpected.push(route.request().url()); return route.abort() }
      return route.continue()
    })
    await mockMatchingSession(page)
    await mockMatchingApi(page)
    await page.route('**/api/matchmaking/account', route => route.fulfill({ status: 503, json: { code: 'unavailable', error: 'Account identity service unavailable.' } }))
    page.on('request', request => {
      const path = new URL(request.url()).pathname
      if (path.startsWith('/api/') && !(request.method() === 'GET' && path === '/api/matchmaking/account')) forbidden.push(request.url())
    })
    await page.setViewportSize({ width, height: width === 320 ? 568 : width === 390 ? 844 : 900 })
    await page.goto('/matchmaking')
    const setup = page.locator('.pt-access-card')
    await expect(setup.getByRole('heading', { name: 'Profile unavailable', exact: true })).toBeVisible()
    await expect(setup.getByRole('alert')).toContainText('Your saved account could not be read')
    await expect(page.locator('.pt-app')).toHaveCount(0)
    await expect(page.getByRole('form', { name: 'Matching profile setup', exact: true })).toHaveCount(0)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Dating', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Cancel search', exact: true })).toHaveCount(0)
    const dimensions = await setup.locator('button, input, textarea, a').evaluateAll(elements => elements.map(element => element.getBoundingClientRect()).filter(box => box.width && box.height).map(box => ({ width: box.width, height: box.height })))
    for (const box of dimensions) { expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44) }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    expect(await setup.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    console.log(`Unavailable setup ${width} minimum target: ${JSON.stringify({ width: Math.min(...dimensions.map(box => box.width)), height: Math.min(...dimensions.map(box => box.height)) })}`)
    await page.screenshot({ path: `worktree/matchmaking-setup/setup-unavailable-${width}.png`, fullPage: true, animations: 'disabled' })
    await expect(setup.getByLabel('City or campus area')).toHaveCount(0)
    const retry = setup.getByRole('button', { name: 'Retry account', exact: true })
    await retry.evaluate(element => element.scrollIntoView({ block: 'center' }))
    await expect(retry).toBeInViewport()
    expect(await retry.evaluate(element => {
      const box = element.getBoundingClientRect()
      return element.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2))
    })).toBe(true)
    await retry.click()
    await expect(setup.getByRole('alert')).toContainText('Your saved account could not be read')
    await page.screenshot({ path: `worktree/matchmaking-setup/setup-unavailable-actions-${width}.png`, animations: 'disabled' })
    expect(forbidden).toEqual([])
    expect(unexpected).toEqual([])
  })
}

for (const origin of ['shell', 'settings']) {
  test(`mocked ${origin} logout failure stays signed in; retry signs out through auth notifications`, async ({ page }) => {
    await mockMatchingSession(page, true, 1)
    await mockMatchingApi(page)
    const requests: { path: string; method: string }[] = []
    page.on('request', request => {
      const path = new URL(request.url()).pathname
      if (path.startsWith('/api/')) requests.push({ path, method: request.method() })
    })
    const path = origin === 'shell' ? '/matchmaking' : '/settings'
    await page.goto(path)
    if (origin === 'shell') await page.getByRole('button', { name: 'Account menu' }).click()
    const controls = origin === 'shell' ? page.locator('.pt-account-options') : page.getByRole('region', { name: 'Account actions' })
    await controls.getByRole('button', { name: 'Log out', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Could not log out')
    await expect(page).toHaveURL(path)
    if (origin === 'shell') await page.getByRole('button', { name: 'Account menu' }).click()
    await expect(controls.getByRole('button', { name: 'Log out', exact: true })).toBeEnabled()
    await page.waitForLoadState('networkidle')
    const beforeSignOut = [...requests]
    expect(beforeSignOut.length).toBeGreaterThan(0)
    expect(beforeSignOut.every(request => request.method === 'GET' && /^\/api\/matchmaking\/(account|account-profile|profile|status|notifications)$/.test(request.path))).toBe(true)
    await controls.getByRole('button', { name: 'Log out', exact: true }).click()
    const login = `/login?${new URLSearchParams({ returnTo: path })}`
    await expect(page).toHaveURL(login)
    await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
    await expect(page.locator('.pt-app')).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: 'Primary navigation', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Find Friends' })).toHaveCount(0)
    expect(requests).toEqual(beforeSignOut)
    // Represent the SDK's persisted signed-out state in the reloaded mock module.
    await mockMatchingSession(page, false)
    await page.reload()
    await expect(page).toHaveURL(login)
    await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
    await expect(page.locator('.pt-app')).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: 'Primary navigation', exact: true })).toHaveCount(0)
    expect(requests).toEqual(beforeSignOut)
  })
}

for (const mode of ['active']) {
  const startName = mode === 'active' ? 'Find Friends' : 'Turn on downtime matching'
  const leaveName = mode === 'active' ? 'Cancel search' : 'Pause downtime matching'
  test(`mocked ${mode} queue, explicit lookup and cancellation failure`, async ({ page }) => {
    await mockMatchingSession(page)
    await mockMatchingApi(page)
    let checks = 0
    await page.route('**/api/matchmaking/result', route => {
      checks++
      expect(route.request().headers().authorization).toBe('Bearer browser-user-jwt')
      return route.fulfill({ json: { candidate: { id: 'a0000000-0000-4000-8000-000000000002', name: 'Taylor', avatar: null, interests: ['Coffee'], overlap: 'some', mode, meetup: null } } })
    })
    await page.goto(mode === 'active' ? '/matchmaking' : '/downtime-matchmaking')
    await expect(page.getByRole('button', { name: startName, exact: true })).toBeEnabled()
    expect(checks).toBe(0)
    await page.getByRole('button', { name: startName, exact: true }).click()
    await expect(page.getByRole('status')).toContainText(`${mode} queue`)
    expect(checks).toBe(0)
    await page.getByRole('button', { name: 'Check for a match' }).click()
    await expect(page.getByRole('heading', { name: 'Taylor' })).toBeVisible()
    expect(checks).toBe(1)
    await page.route('**/api/matchmaking/queue', route => route.request().method() === 'DELETE' ? route.fulfill({ status: 503, json: { code: 'provider', error: 'Matching service failed. Please try again.' } }) : route.fallback())
    await page.getByRole('button', { name: leaveName, exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Matching service failed')
    await expect(page.getByRole('status')).toContainText(`${mode} queue`)
    await page.unroute('**/api/matchmaking/queue')
    await page.getByRole('button', { name: leaveName, exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Ready when you are')
  })
  test(`mocked ${mode} enrollment requires a saved profile; failed save cannot unlock it`, async ({ page }) => {
    await mockMatchingSession(page)
    await mockMatchingApi(page)
    let savesFail = true
    let persisted = browserAccount({ ...browserProfile, birthdate: null, location_city: null, availability: [] })
    let joins = 0
    await page.route('**/api/matchmaking/queue', route => {
      if (route.request().method() === 'POST') joins++
      return route.fallback()
    })
    await page.route('**/api/matchmaking/account', route => {
      if (route.request().method() === 'GET') return route.fulfill({ json: persisted })
      if (!savesFail) persisted = route.request().postDataJSON()
      return savesFail ? route.fulfill({ status: 503, json: { code: 'unavailable', error: 'Profile save unavailable.' } }) : route.fulfill({ json: persisted })
    })
    await page.route('**/api/matchmaking/profile', route => route.fulfill({ json: { profile: persisted.profile } }))
    await page.goto(mode === 'active' ? '/matchmaking' : '/downtime-matchmaking')
    await expect(page.getByRole('heading', { name: 'Complete onboarding', exact: true })).toBeVisible()
    const start = page.getByRole('button', { name: startName, exact: true })
    if (mode === 'active') {
      await expect(start).toHaveCount(0)
      const save = page.getByRole('button', { name: 'Finish onboarding', exact: true })
      await expect(save).toBeEnabled()
      await page.getByLabel('City or campus area').fill('Explicit campus')
      await page.getByLabel('Birthdate', { exact: true }).fill('2001-02-03')
      await page.getByRole('button', { name: 'Monday morning, not available', exact: true }).click()
      await save.click()
      await expect(page.getByRole('alert')).toContainText('Account save could not be confirmed')
      expect(joins).toBe(0)
      savesFail = false
      await page.getByRole('button', { name: 'Retry account', exact: true }).click()
      await expect(save).toBeEnabled()
      await save.click()
      await expect(start).toBeEnabled()
      expect(joins).toBe(0)
      await start.click()
      await expect(page.getByRole('button', { name: leaveName, exact: true })).toBeEnabled()
      expect(joins).toBe(1)
      return
    }
    await expect(start).toBeDisabled()
    await page.getByRole('button', { name: 'Preferences', exact: true }).click()
    await expect(page.getByText(/Using your saved account identity/)).toBeVisible()
    await expect(page.getByLabel('Username', { exact: true })).toHaveCount(0)
    await expect(page.getByLabel('Display name', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Save preferences' }).click()
    await expect(page.getByRole('alert')).toContainText('Profile save unavailable')
    await page.keyboard.press('Escape')
    await expect(start).toBeDisabled()
    expect(joins).toBe(0)
    savesFail = false
    await page.getByRole('button', { name: 'Preferences', exact: true }).click()
    await expect(page.getByText(/Using your saved account identity/)).toBeVisible()
    await page.getByRole('button', { name: 'Save preferences' }).click()
    await expect(start).toBeEnabled()
    await start.click()
    await expect(page.getByRole('button', { name: leaveName, exact: true })).toBeEnabled()
    expect(joins).toBe(1)
  })
  test(`mocked ${mode} profile failure prevents enrollment until a successful retry`, async ({ page }) => {
    await mockMatchingSession(page)
    await mockMatchingApi(page)
    let fails = true
    let joins = 0
    await page.route('**/api/matchmaking/queue', route => {
      if (route.request().method() === 'POST') joins++
      return route.fallback()
    })
    await page.route('**/api/matchmaking/account', route => fails ? route.fulfill({ status: 503, json: { code: 'unavailable', error: 'Profile load unavailable.' } }) : route.fulfill({ json: browserAccount() }))
    await page.goto(mode === 'active' ? '/matchmaking' : '/downtime-matchmaking')
    await expect(page.getByRole('alert')).toContainText('Your saved account could not be read')
    const start = page.getByRole('button', { name: startName, exact: true })
    await expect(start).toHaveCount(0)
    await page.getByRole('button', { name: 'Retry account', exact: true }).click()
    await expect(start).toHaveCount(0)
    expect(joins).toBe(0)
    fails = false
    await page.getByRole('button', { name: 'Retry account' }).click()
    await expect(start).toBeEnabled()
  })
  test(`mocked ${mode} profile failure blocks private queue controls without changing the existing queue`, async ({ page }) => {
    await mockMatchingSession(page)
    await mockMatchingApi(page)
    let queued: string | null = mode === 'active' ? 'downtime' : 'active'
    let leaves = 0
    let joins = 0
    await page.route('**/api/matchmaking/account', route => route.fulfill({ status: 503, json: { code: 'unavailable', error: 'Profile load unavailable.' } }))
    await page.route('**/api/matchmaking/status', route => route.fulfill({ json: { mode: queued } }))
    await page.route('**/api/matchmaking/queue', route => {
      if (route.request().method() === 'POST') joins++
      if (route.request().method() === 'DELETE') { leaves++; queued = null }
      return route.fulfill({ json: { mode: queued } })
    })
    await page.goto(mode === 'active' ? '/matchmaking' : '/downtime-matchmaking')
    await expect(page.getByRole('alert')).toContainText('Your saved account could not be read')
    await expect(page.getByRole('button', { name: startName, exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Retry account', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Profile unavailable', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: leaveName, exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: startName, exact: true })).toHaveCount(0)
    expect(leaves).toBe(0)
    expect(joins).toBe(0)
  })
}
test('mocked sign-in gating and atomic profile failure are honest', async ({ page }) => {
  await mockMatchingSession(page, false)
  await page.goto('/matchmaking')
  await expect(page).toHaveURL('/login?returnTo=%2Fmatchmaking')
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Find Friends' })).toHaveCount(0)
  await page.getByLabel('Email').fill('student@example.test')
  await page.getByRole('button', { name: 'Send sign-in link' }).click()
  await expect(page.getByRole('status')).toContainText('Check your email')
  await page.unroute('**/src/supabase.ts')
  await mockMatchingSession(page)
  await mockMatchingApi(page)
  await page.goto('/matchmaking')
  await page.getByRole('button', { name: 'Preferences' }).click()
  await page.route('**/api/matchmaking/profile', route => route.request().method() === 'PUT' ? route.fulfill({ status: 503, json: { code: 'unavailable', error: 'Matching RPC is not available yet.' } }) : route.fallback())
  await page.getByRole('button', { name: 'Save preferences' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('not available yet')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Preferences' })).toBeFocused()
})
