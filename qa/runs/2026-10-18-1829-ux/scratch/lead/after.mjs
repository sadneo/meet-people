// Read-only after-fix capture for every UX finding in this run. No saves, queue changes or reads marked.
import { mkdirSync } from 'node:fs'
import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const run = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1829-ux'
const out = `${run}/screenshots/after`
mkdirSync(out, { recursive: true })
const only = process.argv[2]
const log = (area, data) => console.log(JSON.stringify({ area, ...data }))
const want = area => !only || only.split(',').includes(area)

async function as(user, [width, height], fn) {
  const X = await openAs(user, { width, height })
  try { await fn(X.page, `${width}x${height}`) } finally {
    if (X.problems.length) log('problems', { user, width, problems: X.problems })
    await X.close()
  }
}

if (want('queue')) for (const size of [[320, 568], [390, 844], [1280, 720], [1920, 1080]]) await as('dave', size, async (page, label) => {
  await page.goto('/events')
  const see = page.getByRole('link', { name: 'See event & people' }).first()
  await see.waitFor()
  if (size[0] === 1920) {
    await page.getByRole('region', { name: 'Event group queue' }).last().scrollIntoViewIfNeeded()
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${out}/events-preview-queue-${label}.png` })
  }
  await page.screenshot({ path: `${out}/events-page-${label}.png` })
  log('event-title', { label, color: await page.locator('.ev-name-link').first().evaluate(e => [getComputedStyle(e).color, getComputedStyle(e).textDecorationLine]) })
  await page.goto(await see.getAttribute('href'))
  const queue = page.getByRole('region', { name: 'Event group queue' })
  await queue.getByRole('button', { name: 'Refresh queue' }).waitFor()
  await page.waitForTimeout(600)
  await queue.scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${out}/events-detail-queue-${label}.png` })
  log('queue', { label, gap: await queue.evaluate(section => {
    const [a, b] = [...section.querySelectorAll('.ev-queue-actions button')].map(button => button.getBoundingClientRect())
    return { horizontalGap: b.top === a.top ? b.left - a.right : null, verticalGap: b.top !== a.top ? b.top - a.bottom : null }
  }), overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth) })
})

if (want('multiday')) for (const size of [[390, 844], [1280, 720]]) await as('iris', size, async (page, label) => {
  let fixture
  await page.route('**/api/events?*', async route => {
    const data = await (await route.fetch()).json()
    fixture = { ...data.events[0], title: 'Autumn film weekend', starts_at: '2026-10-24T22:00:00Z', ends_at: '2026-10-26T18:00:00Z', location_name: 'Campus cinema' }
    await route.fulfill({ json: { ...data, events: [fixture] } })
  })
  await page.goto('/events')
  await page.getByRole('link', { name: 'See event & people' }).first().waitFor()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${out}/events-multiday-card-${label}.png` })
  log('multiday-card', { label, text: await page.locator('.ev-event-date').first().innerText() })
  await page.route(`**/api/events/${fixture.id}`, route => route.fulfill({ json: fixture }))
  await page.goto(`/events/${fixture.id}`)
  await page.getByRole('heading', { name: fixture.title, exact: true }).waitFor()
  await page.locator('.ev-detail-fact').first().scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${out}/events-multiday-detail-${label}.png` })
  log('multiday-detail', { label, text: await page.locator('.ev-detail-fact').first().innerText() })
})

if (want('prefs')) for (const size of [[320, 568], [390, 844], [801, 860], [1280, 720]]) await as('carol', size, async (page, label) => {
  await page.goto('/matchmaking')
  await page.getByRole('button', { name: 'Preferences', exact: true }).click()
  const dialog = page.locator('dialog[open]')
  await dialog.waitFor()
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${out}/match-prefs-top-${label}.png` })
  log('prefs', { label, metrics: await dialog.evaluate(element => {
    const body = element.querySelector('.match-preferences-body'), r = node => node.getBoundingClientRect()
    const inputs = [...element.querySelectorAll('.match-preferences-body input, .match-preferences-body textarea')]
    return {
      heading: { height: r(element.querySelector('h2')).height, font: getComputedStyle(element.querySelector('h2')).fontFamily.split(',')[0] },
      saveHeight: r(element.querySelector('footer [type=submit]')).height,
      bodyHeight: body.clientHeight, scrollHeight: body.scrollHeight,
      visibleFields: inputs.filter(input => r(input).bottom <= r(body).bottom && r(input).top >= r(body).top).length,
      dialogOverflowX: element.scrollWidth > element.clientWidth,
    }
  }) })
  await dialog.locator('fieldset textarea').first().scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${out}/match-prefs-interests-${label}.png` })
  await page.getByLabel('Start 1', { exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${out}/match-prefs-time-${label}.png` })
  await page.keyboard.press('Escape')
})

if (want('forms')) for (const size of [[390, 844], [801, 844], [1280, 720]]) {
  const [, label] = [null, `${size[0]}x${size[1]}`]
  await as('grace', size, async page => {
    await page.goto('/profile')
    await page.getByRole('button', { name: 'Edit profile', exact: true }).waitFor()
    await page.screenshot({ path: `${out}/FORMS-profile-${label}.png` })
    log('profile', { label, rects: await page.evaluate(() => {
      const r = s => document.querySelector(s).getBoundingClientRect()
      return { avatarTop: r('.pt-profile-portrait .pt-avatar').top, avatarHeight: r('.pt-profile-portrait .pt-avatar').height, portraitHeight: r('.pt-profile-portrait').height, coverBottom: r('.pt-profile-cover').bottom }
    }) })
    await page.goto('/settings')
    await page.getByLabel('Comfortable distance').scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${out}/FORMS-settings-social-${label}.png` })
    log('settings', { label, inset: await page.getByLabel('Comfortable distance').evaluate(e => e.getBoundingClientRect().left - e.closest('section').getBoundingClientRect().left) })
  })
  await as('guest', size, async page => {
    await page.goto('/login')
    await page.getByLabel('Email').waitFor()
    // Reach the password step without the rate-limited email lookup.
    await page.evaluate(() => history.replaceState({ usr: { authStep: 'password', email: 'alice@example.com' }, key: 'ux-after', idx: 0 }, '', '/login'))
    await page.reload()
    const forgot = page.getByRole('link', { name: 'Forgot password?' })
    await forgot.waitFor()
    await page.screenshot({ path: `${out}/FORMS-password-${label}.png` })
    log('auth-link', { label, color: await forgot.evaluate(e => getComputedStyle(e).color) })
  })
  await as('alice', size, async page => {
    await page.route('**/api/conversations/*/read', route => route.fulfill({ json: { lastReadSeq: JSON.parse(route.request().postData()).seq } }))
    await page.goto('/messages')
    const heading = page.getByRole('heading', { name: 'Messages', exact: true })
    await heading.waitFor()
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${out}/FORMS-inbox-${label}.png` })
    log('messages-heading', { label, overlap: await heading.evaluate(element => {
      const range = document.createRange(); range.selectNodeContents(element)
      const t = range.getBoundingClientRect(), b = element.closest('header').querySelector('button').getBoundingClientRect()
      return Math.max(0, Math.min(t.right, b.right) - Math.max(t.left, b.left)) * Math.max(0, Math.min(t.bottom, b.bottom) - Math.max(t.top, b.top))
    }) })
  })
}

if (want('home')) for (const size of [[320, 568], [390, 844], [799, 900], [800, 900], [801, 900], [801, 568], [1280, 720], [1920, 1080]]) {
  const label = `${size[0]}x${size[1]}`
  await as('guest', size, async page => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    const action = page.getByRole('link', { name: 'Find people' })
    await action.waitFor()
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${out}/home-guest-${label}.png` })
    log('home', { label, mascot: await page.locator('.pt-pebble-refresh').first().evaluate(e => Math.round(e.getBoundingClientRect().width)), action: Math.round((await action.boundingBox()).width), overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth) })
  })
  await as('frank', size, async page => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/community')
    const bell = page.getByRole('button', { name: /Matching notifications,/ })
    await bell.waitFor()
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${out}/community-frank-${label}.png` })
    const back = await page.getByRole('link', { name: 'Back to Home', exact: true }).boundingBox(), b = await bell.boundingBox()
    const dates = await page.locator('.pt-history-dates').boundingBox(), nav = await page.locator('.pt-bottom-nav').boundingBox()
    log('community', { label, backY: back.y, bellY: b.y, bellX: b.x, backRight: back.x + back.width, datesBottom: Math.round(dates.y + dates.height), navTop: nav ? nav.y : null })
  })
}
