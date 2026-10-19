import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { chromium } from '@playwright/test'
const run = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700'
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').trim().split('\n').map(line => line.split(/=(.*)/s, 2)))
const key = `sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`
const cache = `${homedir()}/.cache/ms-playwright`
const build = readdirSync(cache).filter(n => /^chromium-\d+$/.test(n)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))[0]
const browser = await chromium.launch({ executablePath: `${cache}/${build}/chrome-linux64/chrome` })
async function device(width) {
  const response = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'qa-auth-2@example.com', password: 'password123' }) })
  assert.equal(response.ok, true, 'Local verification account sign-in must work')
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 860 }, baseURL: 'http://127.0.0.1:3000' })
  await context.addInitScript(([name, value]) => { if (!sessionStorage.getItem('qa-seeded')) { localStorage.setItem(name, value); sessionStorage.setItem('qa-seeded', '1') } }, [key, JSON.stringify(await response.json())])
  return context.newPage()
}
try {
  for (const width of [390, 1280]) {
    const A = await device(width), B = await device(390)
    try {
      const statuses = [], errors = []
      A.on('response', r => { if (r.status() >= 400 && r.url().includes('/api/')) statuses.push({ status: r.status(), path: new URL(r.url()).pathname }) })
      A.on('pageerror', e => errors.push(String(e)))
      await A.goto('/profile')
      await A.getByRole('button', { name: 'Edit profile', exact: true }).waitFor()
      await B.goto('/settings')
      await B.getByRole('button', { name: 'Log out', exact: true }).click()
      await B.waitForURL('**/login')
      await A.reload()
      await A.waitForURL('**/login?returnTo=%2Fprofile')
      await A.getByLabel('Email', { exact: true }).waitFor()
      assert.equal(await A.getByLabel('Email', { exact: true }).isEnabled(), true)
      assert.equal(await A.getByRole('button', { name: 'Retry account', exact: true }).count(), 0)
      assert.equal(statuses.some(r => r.status === 401 && r.path.endsWith('/account')), true)
      assert.equal(await A.evaluate(name => localStorage.getItem(name), key), null)
      await A.waitForTimeout(700)
      await A.screenshot({ path: `${run}/screenshots/AUTH-01-after-${width}.png`, fullPage: true })
      await A.goto('/login')
      await A.getByLabel('Email', { exact: true }).waitFor()
      assert.equal(errors.length, 0)
      console.log(JSON.stringify({ id: 'AUTH-01', width, recoveredSignIn: true, localSessionCleared: true, expected: 'Account 401 after other device global logout', statuses, pageErrors: errors }))
    } finally { await A.context().close(); await B.context().close() }
  }
} finally { await browser.close() }
