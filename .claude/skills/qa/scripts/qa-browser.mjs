// Browser helper for QA agents. Drives the running local app with Playwright as a seeded user.
//
// Command line (quick look at one page):
//   node qa-browser.mjs look <user|guest> <path> [WIDTHxHEIGHT] [screenshot.png]
//   e.g. node qa-browser.mjs look alice /messages 390x844 qa/runs/<run>/screenshots/msg-inbox.png
//   Prints the page's accessibility tree (what a screen reader sees), alerts, and any
//   console errors, page errors, failed requests and 5xx responses.
//
// Library (multi-step checks): write a small .mjs script in your run's scratch folder:
//   import { openAs, latestEmailLinks } from '/abs/path/.claude/skills/qa/scripts/qa-browser.mjs'
//   const { page, problems, shot, close } = await openAs('alice', { width: 390, height: 844 })
//   await page.goto('/messages'); ...; await shot('qa/runs/<run>/screenshots/x.png'); console.log(problems); await close()
//
// Seeded users all use password "password123" and have finished onboarding. Sign-in here uses the
// password grant directly and caches tokens in qa/.sessions/, so it never touches the
// rate-limited /api/auth/email endpoint (10 attempts per IP per 10 minutes).
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const project = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const require = createRequire(join(project, 'package.json'))
const { chromium } = require('@playwright/test')
const env = Object.fromEntries(readFileSync(join(project, '.env.local'), 'utf8').trim().split('\n').map(line => line.split(/=(.*)/s, 2)))
export const BASE = process.env.QA_BASE_URL ?? 'http://127.0.0.1:3000'
const SUPABASE = env.VITE_SUPABASE_URL
const STORAGE_KEY = `sb-${new URL(SUPABASE).hostname.split('.')[0]}-auth-token`
const MAIL = 'http://127.0.0.1:54324'
const SESSIONS = join(project, 'qa/.sessions')

// Playwright 1.63 expects a Chromium build that may not be downloaded; use the newest cached one.
function chromiumPath() {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  const cache = join(homedir(), '.cache/ms-playwright')
  const builds = existsSync(cache) ? readdirSync(cache).filter(name => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1])) : []
  for (const build of builds) {
    const path = join(cache, build, 'chrome-linux64/chrome')
    if (existsSync(path)) return path
  }
  return undefined
}

async function session(user) {
  mkdirSync(SESSIONS, { recursive: true })
  const file = join(SESSIONS, `${user}.json`)
  if (existsSync(file)) {
    const saved = JSON.parse(readFileSync(file, 'utf8'))
    if (saved.expires_at * 1000 - Date.now() > 5 * 60_000) return saved
  }
  const email = user.includes('@') ? user : `${user}@example.com`
  const response = await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: process.env.QA_PASSWORD ?? 'password123' }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(`Could not sign in ${email}: ${JSON.stringify(data)}`)
  writeFileSync(file, JSON.stringify(data))
  return data
}

// user: a seeded name ("alice"), a full email, or "guest" for signed out.
export async function openAs(user, viewport = { width: 1280, height: 860 }) {
  const browser = await chromium.launch({ executablePath: chromiumPath() })
  const context = await browser.newContext({ viewport, baseURL: BASE })
  if (user !== 'guest') {
    const value = JSON.stringify(await session(user))
    // Seed the session once per tab, so testing "Log out" is not undone on the next navigation.
    await context.addInitScript(([key, value]) => {
      if (!sessionStorage.getItem('qa-seeded')) { localStorage.setItem(key, value); sessionStorage.setItem('qa-seeded', '1') }
    }, [STORAGE_KEY, value])
  }
  const page = await context.newPage()
  const problems = []
  page.on('console', message => { if (message.type() === 'error') problems.push(`console: ${message.text().slice(0, 300)}`) })
  page.on('pageerror', error => problems.push(`page error: ${String(error).slice(0, 300)}`))
  page.on('requestfailed', request => problems.push(`request failed: ${request.method()} ${request.url()} (${request.failure()?.errorText})`))
  // 4xx can be expected (401 when signed out); the URL lets you judge.
  page.on('response', response => { if (response.status() >= 400) problems.push(`${response.status()}: ${response.request().method()} ${response.url()}`) })
  page.on('dialog', dialog => { problems.push(`dialog: ${dialog.message()}`); void dialog.dismiss() })
  const shot = async path => { mkdirSync(dirname(resolve(path)), { recursive: true }); await page.screenshot({ path, fullPage: true }); return path }
  return { browser, context, page, problems, shot, close: () => browser.close() }
}

// Links in the newest local email to `to` (Mailpit), for registration and password reset flows.
export async function latestEmailLinks(to, since = new Date(Date.now() - 60_000)) {
  const list = await (await fetch(`${MAIL}/api/v1/messages`)).json()
  const message = list.messages.find(item => item.To?.some(address => address.Address === to) && new Date(item.Created) >= since)
  if (!message) return []
  const full = await (await fetch(`${MAIL}/api/v1/message/${message.ID}`)).json()
  return [...full.HTML.matchAll(/href="([^"]+)"/g)].map(match => match[1].replaceAll('&amp;', '&'))
}

if (process.argv[2] === 'look') {
  const [, , , user = 'guest', path = '/', size = '1280x860', screenshot] = process.argv
  const [width, height] = size.split('x').map(Number)
  const { page, problems, shot, close } = await openAs(user, { width, height })
  try {
    await page.goto(path)
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
    // Polling pages never go fully idle; give data loads a moment before reading the page.
    await page.waitForTimeout(1500)
    console.log(`URL: ${page.url()}  (${width}x${height}, ${user})`)
    console.log(`Horizontal overflow: ${await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)}`)
    console.log('--- Page (accessibility tree) ---')
    const tree = await page.locator('body').ariaSnapshot()
    console.log(tree.length > 12_000 ? `${tree.slice(0, 12_000)}\n… (truncated)` : tree)
    if (screenshot) console.log(`Screenshot: ${await shot(screenshot)}`)
    console.log('--- Problems ---')
    console.log(problems.length ? problems.join('\n') : 'none')
  } finally { await close() }
}
