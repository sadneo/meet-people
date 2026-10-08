import { expect, test } from '@playwright/test'

// UI integration test with an explicitly mocked API; this is not DB proof.
// Serve Vite with VITE_SUPABASE_URL=http://127.0.0.1:54321 and a nonempty
// VITE_SUPABASE_PUBLISHABLE_KEY, then set PLAYWRIGHT_BASE_URL to that server.
const user = 'a0000000-0000-4000-8000-000000000001'
const other = 'a0000000-0000-4000-8000-000000000002'
const a = 'c0000000-0000-4000-8000-000000000001'
const b = 'c0000000-0000-4000-8000-000000000002'
const participants = [{ id: user, display_name: 'Sam', avatar_url: null }, { id: other, display_name: 'Taylor', avatar_url: null }]

for (const width of [320, 390, 799, 800, 801, 1280, 1800]) {
  test(`saved messaging UI at ${width}px, refresh and conversation isolation`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 740 })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(({ user }) => {
      const token = `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ sub: user, exp: 4102444800 }))}.browser-test-signature`
      localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: token, refresh_token: 'browser-test-refresh', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user: { id: user, aud: 'authenticated', role: 'authenticated', user_metadata: {} } }))
    }, { user })
    const rows = [{ id: 'b0000000-0000-4000-8000-000000000001', conversation_id: a, sender_id: other, body: 'Previous saved message', created_at: '2026-10-08T12:00:00Z', client_request_id: 'd0000000-0000-4000-8000-000000000001' }]
    let posts = 0
    await page.route('**/api/conversations**', async route => {
      const request = route.request()
      const url = new URL(request.url())
      if (request.method() === 'POST') {
        posts++
        const payload = request.postDataJSON()
        const message = { ...rows[0], id: crypto.randomUUID(), sender_id: user, body: payload.body, client_request_id: payload.clientRequestId }
        rows.push(message)
        await route.fulfill({ json: message }); return
      }
      if (url.pathname.endsWith('/messages')) {
        await route.fulfill({ json: { messages: rows.filter(row => url.pathname.includes(row.conversation_id)), participants, nextCursor: null } }); return
      }
      await route.fulfill({ json: { conversations: [a, b].map(id => ({ id, created_at: rows[0].created_at, participants: id === a ? participants : [participants[0], { ...participants[1], display_name: 'Jordan' }], latest_message: rows.filter(row => row.conversation_id === id).at(-1) ?? null })), hasMore: false } })
    })
    await page.goto('/messages')
    await page.getByRole('button', { name: /Taylor.*Previous saved message/ }).click()
    const history = page.getByRole('region', { name: 'Message history' })
    await expect(history.getByText('Previous saved message')).toBeVisible()
    await page.getByLabel('Message', { exact: true }).fill('M3 messaging persistence test')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(history.getByText('M3 messaging persistence test')).toBeVisible()
    expect(posts).toBe(1)
    await page.reload()
    await expect(history.getByText('M3 messaging persistence test')).toBeVisible()
    await expect(page.locator('.pt-inbox-pane')).toBeVisible({ visible: width > 800 })
    await expect(page.locator('.pt-chat-details')).toBeVisible({ visible: width > 800 })
    const composer = await page.getByRole('form', { name: 'Send message' }).boundingBox()
    const nav = width <= 800 ? await page.locator('.pt-bottom-nav').boundingBox() : null
    expect(composer!.y + composer!.height).toBeLessThanOrEqual(nav?.y ?? 740)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    if (width === 390 || width === 1280) await page.screenshot({ path: testInfo.outputPath(`messages-${width}.png`) })
    if (width <= 800) await page.getByRole('link', { name: 'Back to messages', exact: true }).click()
    await page.getByRole('button', { name: /Jordan.*Say hello/ }).click()
    await expect(history.getByText('No messages yet. Say hello.')).toBeVisible()
    await expect(history.getByText('M3 messaging persistence test')).toHaveCount(0)
    await page.setViewportSize({ width, height: 560 })
    const shortComposer = await page.getByRole('form', { name: 'Send message' }).boundingBox()
    const shortNav = width <= 800 ? await page.locator('.pt-bottom-nav').boundingBox() : null
    expect(shortComposer!.y + shortComposer!.height).toBeLessThanOrEqual(shortNav?.y ?? 560)
    expect(errors).toEqual([])
  })
}
