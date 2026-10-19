// Two independent sessions for the same user ("phone" and "laptop"). Log out on the phone, then use the laptop.
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
const project = '/home/xqiu/Projects/meet-people'
const require = createRequire(project + '/package.json')
const { chromium } = require('@playwright/test')
const env = Object.fromEntries(readFileSync(project + '/.env.local', 'utf8').trim().split('\n').map(l => l.split(/=(.*)/s, 2)))
const KEY = `sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`
const R = project + '/qa/runs/2026-10-18-1700/screenshots'
const email = process.argv[2], password = process.argv[3] ?? 'password123', tag = process.argv[4] ?? 'a'
const log = (...a) => console.log(...a)
async function grant() {
  const r = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
  if (!r.ok) throw new Error(await r.text()); return r.json()
}
const { readdirSync, existsSync } = await import('node:fs'); const { homedir } = await import('node:os')
const cache = homedir() + '/.cache/ms-playwright'; const build = readdirSync(cache).filter(n => /^chromium-\d+$/.test(n)).sort((a, b) => b.split('-')[1] - a.split('-')[1])[0]
const browser = await chromium.launch({ executablePath: `${cache}/${build}/chrome-linux64/chrome` })
async function device(name, viewport) {
  const s = await grant()
  const ctx = await browser.newContext({ viewport, baseURL: 'http://127.0.0.1:3000' })
  await ctx.addInitScript(([k, v]) => { if (!localStorage.getItem('qa-init')) { localStorage.setItem(k, v); localStorage.setItem('qa-init', '1') } }, [KEY, JSON.stringify(s)])
  const page = await ctx.newPage()
  page.on('response', r => { if (r.url().includes('/auth/v1/logout') || (r.status() >= 400 && !r.url().includes('favicon'))) log(`  [${name}] ${r.status()} ${r.request().method()} ${r.url()}`) })
  page.on('requestfailed', r => log(`  [${name}] failed ${r.method()} ${r.url()} ${r.failure()?.errorText}`))
  return page
}
const phone = await device('phone', { width: 390, height: 844 })
const laptop = await device('laptop', { width: 1280, height: 860 })
await laptop.goto('/profile'); await laptop.waitForTimeout(2000)
log('laptop before:', (await laptop.locator('h1').first().innerText()).slice(0, 40))
await phone.goto('/settings'); await phone.waitForTimeout(2000)
await phone.getByRole('button', { name: 'Log out' }).click(); await phone.waitForTimeout(3000)
log('phone after logout:', phone.url())
await laptop.reload(); await laptop.waitForTimeout(3000)
log('laptop after phone logout:', laptop.url(), '|', (await laptop.locator('h1, [role=status], [role=alert]').allInnerTexts()).join(' / '))
await laptop.screenshot({ path: `${R}/AUTH-laptop-after-phone-logout-${tag}-1280.png` })
await laptop.goto('/login'); await laptop.waitForTimeout(2500)
log('laptop /login:', (await laptop.locator('h1, [role=status], [role=alert]').allInnerTexts()).join(' / '))
const retry = laptop.getByRole('button', { name: /Retry/ }).first(); if (await retry.count()) { await retry.click(); await laptop.waitForTimeout(2000); log('after retry:', (await laptop.locator('h1, [role=status], [role=alert]').allInnerTexts()).join(' / ')) }
await browser.close()
