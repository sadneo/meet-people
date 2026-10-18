// AUTHORED ONLY: parent review/authorization required. No .env reads, output of
// credentials, traces, screenshots, auth mocks, provider configuration or DB work.
/* global process, URL, fetch, AbortSignal, setTimeout, location, document */
import { randomBytes, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { chromium, expect } from '@playwright/test'

export function loopbackUrl(value) {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.hash) throw new Error('non-loopback-endpoint')
  return url
}
export function disposableEmail(email, runId) {
  if (!/^[a-f0-9-]{36}$/.test(runId) || ![`credentials-${runId}@example.test`, `credentials-${runId}-changed@example.test`, `credentials-${runId}-anonymous@example.test`].includes(email)) throw new Error('non-disposable-account')
  return email
}

export function mailpitSearchUrl(origin, email, runId) {
  const base = loopbackUrl(origin)
  disposableEmail(email, runId)
  return new URL(`/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`, base).href
}
export function mailpitMessageIds(payload) {
  if (!Array.isArray(payload?.messages) || payload.messages.some(message => typeof message?.ID !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(message.ID))) throw new Error('mailpit-format-unavailable')
  return payload.messages.map(message => message.ID)
}
export function mailpitText(message) {
  if (!message || [message.Text, message.HTML].some(value => value !== undefined && typeof value !== 'string')) throw new Error('mailpit-format-unavailable')
  return `${message.Text ?? ''}\n${message.HTML ?? ''}`.replaceAll('&amp;', '&')
}
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
class NonRetryableRead extends Error {}
// Only local GET reads retry: at most three attempts, with 1s/2s waits. Mutating
// Auth/admin actions are never replayed when their outcome may be uncertain.
export async function localJson(url, options = {}, { transport = fetch, wait = sleep } = {}) {
  loopbackUrl(url)
  const read = (options.method ?? 'GET').toUpperCase() === 'GET'
  const attempts = read ? 3 : 1
  for (let attempt = 0; attempt < attempts; attempt++) {
    let stop = false
    try {
      const response = await transport(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(15000) })
      if (response.ok) return await response.json()
      if (![429, 500, 502, 503, 504].includes(response.status)) throw new NonRetryableRead()
    } catch (failure) {
      stop = failure instanceof NonRetryableRead
    }
    if (stop) throw new Error('local-http-failure')
    if (attempt === attempts - 1) throw new Error(read ? 'local-read-retry-exhausted' : 'local-http-failure')
    await wait(1000 * (attempt + 1))
  }
}
const failureCategories = new Set([
  'authorization-required', 'pinned-playwright-required', 'non-loopback-endpoint',
  'non-disposable-account', 'unapproved-app-origin', 'invalid-local-service-origin',
  'cleanup-capability-required', 'local-http-failure', 'local-read-retry-exhausted',
  'invalid-disposable-seed', 'external-runtime-config-refused', 'actor-readback-mismatch',
  'mailpit-format-unavailable', 'non-local-mail-link', 'mail-callback-refused',
  'captured-email-timeout', 'backend-actor-authentication-unverified',
  'anonymous-creation-failed', 'external-request-refused', 'cleanup-unverified',
])
const failureStages = new Set(['bootstrap', 'seam-open', 'seed-user', 'browser-start', 'runtime-client', 'initial-sign-in', 'email-change', 'email-confirmations', 'password-change', 'password-login', 'backend-actor', 'recovery', 'anonymous-upgrade', 'browser-cleanup', 'cleanup'])
export function failureDiagnostic(failure, stage) {
  // A character-pattern check on error.message is NOT redaction: passwords and
  // tokens can match it. Only these fixed literals may reach the report.
  const message = typeof failure?.message === 'string' ? failure.message : ''
  const stack = typeof failure?.stack === 'string' ? failure.stack : ''
  const lines = [...stack.matchAll(/^\s+at [^\n]*\/validate-local-credentials\.mjs:(\d+):\d+\)?$/gm)].map(match => Number(match[1])).filter(line => Number.isInteger(line) && line > 0 && line <= 4096)
  return {
    failureCategory: failureCategories.has(message) ? message : 'browser-assertion-or-runtime',
    failureStage: failureStages.has(stage) ? stage : 'unknown',
    failureSourceLines: [...new Set(lines)].slice(0, 8),
  }
}

async function main() {
  const report = {}
  let stage = 'bootstrap'
  let browser, context, runOpened = false
  const runId = randomUUID(), knownIds = new Set()
  let seam, capability, emails
  try {
    if (process.env.PEBBLE_CREDENTIALS_LIVE_AUTHORIZED !== 'reviewed-local-only') throw new Error('authorization-required')
    const version = createRequire(import.meta.url)('@playwright/test/package.json').version
    if (version !== '1.63.0') throw new Error('pinned-playwright-required')
    const app = loopbackUrl(process.env.PEBBLE_LOCAL_APP_URL)
    if (![3000, 3002, 3004, 3194].includes(Number(app.port)) || app.pathname !== '/' || app.search) throw new Error('unapproved-app-origin')
    // Retain the old env name as an alias for parent runners. Both names now
    // target Mailpit, regardless of the historical container name "inbucket".
    const mail = loopbackUrl(process.env.PEBBLE_LOCAL_MAILPIT_URL ?? process.env.PEBBLE_LOCAL_INBUCKET_URL)
    seam = loopbackUrl(process.env.PEBBLE_LOCAL_AUTH_SEAM_URL)
    if (mail.pathname !== '/' || seam.pathname !== '/' || mail.search || seam.search) throw new Error('invalid-local-service-origin')
    capability = process.env.PEBBLE_LOCAL_AUTH_SEAM_CAPABILITY
    if (!capability) throw new Error('cleanup-capability-required')
    emails = ['', '-changed', '-anonymous'].map(suffix => disposableEmail(`credentials-${runId}${suffix}@example.test`, runId))
    const [oldEmail, newEmail, anonymousEmail] = emails
    const password1 = `Local-1!${randomBytes(24).toString('base64url')}`
    const password2 = `Local-2!${randomBytes(24).toString('base64url')}`
    const recoveredPassword = `Local-3!${randomBytes(24).toString('base64url')}`
    const anonymousPassword = `Local-4!${randomBytes(24).toString('base64url')}`
    async function json(url, options = {}) {
      return localJson(url, options)
    }
    async function admin(path, body) {
      const url = new URL(`/credential-validation/runs/${runId}${path}`, seam)
      return json(url.href, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${capability}` }, body: JSON.stringify(body) })
    }
    // The seam must ledger this exact allowlist before creating anything; its
    // cleanup operation includes lost-response creations registered to this run.
    stage = 'seam-open'
    await admin('/open', { runId, emails }); runOpened = true
    stage = 'seed-user'
    const created = await admin('/create', { email: oldEmail, password: password1, emailConfirmed: true })
    if (!created.id || created.email !== oldEmail) throw new Error('invalid-disposable-seed')
    knownIds.add(created.id)
    stage = 'browser-start'
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined })
    context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false })
    const externalAttempts = []
    await context.route('**/*', route => {
      try { loopbackUrl(route.request().url()); return route.continue() }
      catch { externalAttempts.push(true); return route.abort() }
    })
    // No module interception, API mocking, storage injection or alternate client.
    const page = await context.newPage()
    stage = 'runtime-client'
    await page.goto(new URL('/login', app).href)
    const authOrigin = await page.evaluate(async () => {
      const { supabase } = await import('/src/supabase.ts')
      if (!supabase) throw new Error('runtime-public-client-required')
      return new URL(supabase.supabaseUrl).origin
    })
    loopbackUrl(authOrigin)
    if (externalAttempts.length) throw new Error('external-runtime-config-refused')
    const credentialGroup = () => page.getByRole('group', { name: 'Email & password', exact: true })
    async function state() {
      return page.evaluate(async () => {
        const { supabase } = await import('/src/supabase.ts')
        const { data, error } = await supabase.auth.getUser()
        if (error || !data.user) throw new Error('authoritative-user-unavailable')
        const user = data.user
        return { id: user.id, email: user.email ?? null, confirmed: !!user.email_confirmed_at, anonymous: !!user.is_anonymous }
      })
    }
    async function assertActor(id, email) {
      const current = await state()
      if (current.id !== id || current.email !== email || !current.confirmed || current.anonymous) throw new Error('actor-readback-mismatch')
    }
    async function signIn(email, password, succeeds = true) {
      await page.goto(new URL('/login', app).href)
      await page.getByRole('button', { name: 'Use password', exact: true }).click()
      await page.getByLabel('Email', { exact: true }).fill(email)
      await page.getByLabel('Password', { exact: true }).fill(password)
      await page.getByRole('button', { name: 'Sign in with password', exact: true }).click()
      if (succeeds) await expect(page).toHaveURL(new URL('/settings', app).href)
      else {
        await expect(page.getByRole('alert')).toContainText('Could not sign in')
        await expect(page.getByLabel('Password', { exact: true })).toHaveValue('')
      }
    }
    async function logout() {
      await page.goto(new URL('/settings', app).href)
      await page.getByRole('region', { name: 'Account actions' }).getByRole('button', { name: 'Log out', exact: true }).click()
      await expect(page).toHaveURL(new URL('/login', app).href)
    }
    const consumed = new Set()
    async function capturedMail(email, type, nonce = false) {
      disposableEmail(email, runId)
      const deadline = Date.now() + 60000
      while (Date.now() < deadline) {
        const ids = mailpitMessageIds(await json(mailpitSearchUrl(mail, email, runId)))
        for (const id of [...ids].reverse()) {
          const key = `${email}/${id}`
          if (consumed.has(key)) continue
          const message = await json(new URL(`/api/v1/message/${encodeURIComponent(id)}`, mail).href)
          const text = mailpitText(message)
          if (nonce) {
            const code = text.match(/(?:verification|security|confirmation|code)[^\d]{0,120}(\d{6,8})\b/i)?.[1]
            if (code) { consumed.add(key); return code }
          } else {
            for (const candidate of text.match(/https?:\/\/[^\s<>"']+/g) ?? []) {
              let link
              try { link = loopbackUrl(candidate) } catch { throw new Error('non-local-mail-link') }
              if (link.origin !== authOrigin || link.pathname !== '/auth/v1/verify' || !(Array.isArray(type) ? type : [type]).includes(link.searchParams.get('type'))) continue
              const redirect = loopbackUrl(link.searchParams.get('redirect_to'))
              if (redirect.origin !== app.origin || redirect.pathname !== '/auth/callback') throw new Error('mail-callback-refused')
              consumed.add(key); return link.href
            }
          }
        }
        await sleep(500)
      }
      throw new Error('captured-email-timeout')
    }
    async function confirm(email, type) {
      const link = await capturedMail(email, type)
      const confirmation = await context.newPage()
      try {
        await confirmation.goto(link)
        await confirmation.waitForFunction(origin => location.origin === origin && !!document.querySelector('h1') && !document.body.textContent.includes('Verifying your account…') && !location.hash.includes('access_token') && !new URL(location.href).searchParams.has('code'), app.origin)
      } finally { await confirmation.close() }
    }
    async function setPassword(password, email) {
      await credentialGroup().getByLabel('New password', { exact: true }).fill(password)
      await credentialGroup().getByRole('button', { name: 'Save password', exact: true }).click()
      await expect(credentialGroup().getByText(/Password updated\.|Verify it is you/)).toBeVisible()
      const challenge = credentialGroup().getByRole('button', { name: 'Send verification code', exact: true })
      if (await challenge.count()) {
        await sleep(1100) // local Auth email frequency is at least one second
        await challenge.click()
        await expect(credentialGroup()).toContainText('Verification code sent.')
        const nonce = await capturedMail(email, 'reauthentication', true)
        await credentialGroup().getByLabel('Verification code', { exact: true }).fill(nonce)
        await credentialGroup().getByLabel('New password', { exact: true }).fill(password)
        await credentialGroup().getByRole('button', { name: 'Save password', exact: true }).click()
        report.reauthentication = 'passed'
      } else report.reauthentication ??= 'not-required-by-server'
      await expect(credentialGroup()).toContainText('Password updated.')
      await expect(credentialGroup().getByLabel('New password', { exact: true })).toHaveValue('')
    }
    stage = 'initial-sign-in'
    await signIn(oldEmail, password1)
    await assertActor(created.id, oldEmail)
    stage = 'email-change'
    await credentialGroup().getByLabel('Sign-in email', { exact: true }).fill(newEmail)
    await credentialGroup().getByRole('button', { name: 'Save email', exact: true }).click()
    await expect(credentialGroup()).toContainText('Email confirmation pending')
    await assertActor(created.id, oldEmail)
    stage = 'email-confirmations'
    await confirm(oldEmail, 'email_change')
    await assertActor(created.id, oldEmail) // double-confirmation must remain enabled
    await confirm(newEmail, 'email_change')
    await page.reload()
    await expect(credentialGroup().getByLabel('Sign-in email', { exact: true })).toHaveValue(newEmail)
    await assertActor(created.id, newEmail)
    report.emailDoubleConfirmation = 'passed'
    stage = 'password-change'
    await setPassword(password2, newEmail)
    await assertActor(created.id, newEmail)
    stage = 'password-login'
    await logout()
    await signIn(newEmail, password1, false)
    await signIn(newEmail, password2)
    await page.reload(); await assertActor(created.id, newEmail)
    stage = 'backend-actor'
    const accepted = await page.evaluate(async () => {
      const { supabase } = await import('/src/supabase.ts')
      const verified = await supabase.auth.getUser()
      const { data } = await supabase.auth.getSession()
      if (verified.error || !verified.data.user || !data.session) return null
      const response = await fetch('/api/matchmaking/status', { headers: { Authorization: `Bearer ${data.session.access_token}` }, redirect: 'error' })
      const rejected = await fetch('/api/matchmaking/status', { redirect: 'error' })
      return { id: verified.data.user.id, accepted: response.status, rejected: rejected.status }
    })
    if (accepted?.id !== created.id || accepted.accepted !== 200 || accepted.rejected !== 401) throw new Error('backend-actor-authentication-unverified')
    report.passwordChangeAndBackendActor = 'passed'
    stage = 'recovery'
    await logout()
    await page.getByRole('link', { name: 'Forgot password?', exact: true }).click()
    // Wait for the new routed form: Email also exists in the previous login form.
    await expect(page.getByRole('heading', { name: 'Recover your password', exact: true })).toBeVisible()
    await page.getByLabel('Email', { exact: true }).fill(newEmail)
    await sleep(1100) // respect local email frequency; never retry Auth mutations
    await page.getByRole('button', { name: 'Send recovery link', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('If this email has an account')
    await confirm(newEmail, 'recovery')
    await page.goto(new URL('/settings', app).href)
    await assertActor(created.id, newEmail)
    await setPassword(recoveredPassword, newEmail)
    await logout(); await signIn(newEmail, password2, false); await signIn(newEmail, recoveredPassword)
    await assertActor(created.id, newEmail)
    report.recovery = 'passed'
    stage = 'anonymous-upgrade'
    await logout()
    const anonymous = await page.evaluate(async () => {
      const { supabase } = await import('/src/supabase.ts')
      const result = await supabase.auth.signInAnonymously()
      if (result.error) return { error: result.error.code === 'anonymous_provider_disabled' ? 'unsupported' : 'failed' }
      const verified = await supabase.auth.getUser()
      if (verified.error || !verified.data.user?.is_anonymous) return { error: 'failed' }
      return { id: verified.data.user.id }
    })
    if (anonymous.error === 'unsupported') report.anonymousUpgrade = 'unsupported-by-local-auth'
    else {
      if (!anonymous.id) throw new Error('anonymous-creation-failed')
      knownIds.add(anonymous.id)
      await admin('/adopt-anonymous', { id: anonymous.id })
      await page.goto(new URL('/settings', app).href)
      await expect(credentialGroup().getByRole('button', { name: 'Save password', exact: true })).toBeDisabled()
      await credentialGroup().getByLabel('Sign-in email', { exact: true }).fill(anonymousEmail)
      await credentialGroup().getByRole('button', { name: 'Save email', exact: true }).click()
      await expect(credentialGroup()).toContainText('Email confirmation pending')
      // Supabase versions may label first anonymous email verification as signup.
      await confirm(anonymousEmail, ['email_change', 'signup'])
      await page.reload(); await assertActor(anonymous.id, anonymousEmail)
      await setPassword(anonymousPassword, anonymousEmail)
      await logout(); await signIn(anonymousEmail, anonymousPassword)
      await page.reload(); await assertActor(anonymous.id, anonymousEmail)
      report.anonymousUpgrade = 'passed'
    }
    if (externalAttempts.length) throw new Error('external-request-refused')
    report.result = 'passed'
  } catch (failure) {
    // Never serialize Error objects, Playwright diagnostics, email bodies, URLs,
    // passwords, nonce values, sessions, tokens or account identifiers.
    report.result = 'failed-or-prerequisite-unavailable'; process.exitCode = 1
    Object.assign(report, failureDiagnostic(failure, stage))
  } finally {
    try { await context?.close(); await browser?.close() } catch (failure) {
      report.browserCleanup = 'failed'; report.browserCleanupFailure = failureDiagnostic(failure, 'browser-cleanup'); process.exitCode = 1
    }
    if (runOpened) {
      try {
        const response = await fetch(new URL(`/credential-validation/runs/${runId}/cleanup`, seam), { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${capability}` }, body: JSON.stringify({ runId, emails, knownIds: [...knownIds] }) })
        const cleaned = response.ok && (await response.json()).cleaned === true
        report.disposableUserCleanup = cleaned ? 'passed' : 'failed-parent-followup-required'
        if (!cleaned) { report.cleanupFailure = failureDiagnostic(new Error('cleanup-unverified'), 'cleanup'); process.exitCode = 1 }
      } catch (failure) { report.disposableUserCleanup = 'failed-parent-followup-required'; report.cleanupFailure = failureDiagnostic(failure, 'cleanup'); process.exitCode = 1 }
    }
    process.stdout.write(`${JSON.stringify(report)}\n`)
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
