// Recover AUTH-01 without logging session values or changing saved profile data.
import { readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { chromium } from '@playwright/test'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').trim().split('\n').map(line => line.split(/=(.*)/s, 2)))
const key = `sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`
const cache = `${homedir()}/.cache/ms-playwright`
const build = readdirSync(cache).filter(name => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))[0]
const browser = await chromium.launch({ executablePath: `${cache}/${build}/chrome-linux64/chrome` })
const grant = async () => {
  const response = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'qa-auth-2@example.com', password: 'password123' }),
  })
  if (!response.ok) throw new Error(`Local test login failed (${response.status})`)
  return response.json()
}

try {
  for (const width of [390, 1280]) {
    const pages = []
    for (const deviceWidth of [width, 390]) {
      const session = await grant()
      const context = await browser.newContext({ viewport: { width: deviceWidth, height: deviceWidth === 390 ? 844 : 860 }, baseURL: 'http://127.0.0.1:3000' })
      await context.addInitScript(([name, value]) => {
        if (!sessionStorage.getItem('qa-seeded')) {
          localStorage.setItem(name, value)
          sessionStorage.setItem('qa-seeded', '1')
        }
      }, [key, JSON.stringify(session)])
      pages.push(await context.newPage())
    }
    const [laptop, phone] = pages
    await laptop.goto('/profile')
    await laptop.getByRole('button', { name: 'Edit profile', exact: true }).waitFor()
    await phone.goto('/settings')
    await phone.getByRole('button', { name: 'Log out', exact: true }).click()
    await phone.waitForURL('**/login')
    const failures = []
    laptop.on('response', response => {
      if (response.status() >= 400 && response.url().includes('/api/')) failures.push(`${response.request().method()} ${new URL(response.url()).pathname} -> ${response.status()}`)
    })
    await laptop.reload()
    await laptop.getByRole('button', { name: 'Retry', exact: true }).waitFor()
    console.log(width, 'revoked profile:', await laptop.locator('main').innerText(), failures)
    await laptop.goto('/login')
    await laptop.getByRole('button', { name: 'Retry account' }).click()
    await laptop.waitForTimeout(500)
    console.log(width, 'revoked login:', await laptop.locator('.pt-auth-form').innerText(), 'password inputs:', await laptop.locator('input[type=password]').count(), 'logout controls:', await laptop.getByRole('button', { name: 'Log out', exact: true }).count())
    await Promise.all(pages.map(page => page.context().close()))
  }
} finally {
  await browser.close()
}
