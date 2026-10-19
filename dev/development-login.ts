import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Plugin } from 'vite'
import { AccountSchema, completedAccountChapters } from '../shared/account.js'

const loopback = (value: string | undefined) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(value ?? '')
const localUrl = (value: string) => {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname) && !!url.port && url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password
  } catch { return false }
}
const publicKey = (value: string) => {
  if (value.startsWith('sb_publishable_')) return value.length > 15
  try { return JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString()).role === 'anon' && value.split('.').length === 3 } catch { return false }
}
const Credentials = z.object({ accountId: z.uuid(), email: z.email().max(254), password: z.string().min(1).max(128), url: z.string().refine(localUrl), publicKey: z.string().max(4096).refine(publicKey) }).strict()
export const parseDevelopmentCredentials = (value: unknown) => Credentials.parse(value)
type Credentials = z.infer<typeof Credentials>
const unavailable = 'Development account provisioning is unavailable. Ask the operator to configure and populate the dedicated local account; no data was created.'

// Runtime-only fixed path. Never imported by the browser; no environment/browser path override.
export async function readDevelopmentCredentials() {
  const file = await open(join(homedir(), '.local/share/pebble/development-account.json'), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const stat = await file.stat()
    if (!stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 0o7777) !== 0o600 || stat.size > 8192) throw new Error('Invalid credential file')
    const buffer = Buffer.alloc(8193)
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0)
    if (bytesRead > 8192) throw new Error('Invalid credential file')
    return parseDevelopmentCredentials(JSON.parse(buffer.subarray(0, bytesRead).toString('utf8')))
  } finally { await file.close() }
}

// All network requests are bounded, local, fixed-path, non-redirecting and user-scoped.
export async function authenticateDevelopmentAccount(input: unknown, network: typeof fetch = fetch) {
  const credentials = parseDevelopmentCredentials(input)
  const base = new URL(credentials.url).origin
  let requests = 0
  const boundedFetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    if (++requests > 3 || url.origin !== base || !['/auth/v1/token', '/auth/v1/user', '/rest/v1/rpc/get_account'].includes(url.pathname) || init?.method !== (url.pathname === '/auth/v1/user' ? 'GET' : 'POST')) throw new Error('Unexpected local request')
    const response = await network(url.href, { ...init, redirect: 'error', signal: AbortSignal.timeout(5000) })
    const reader = response.body?.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      if (reader) while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.length
        if (size > 65536) throw new Error('Local response too large')
        chunks.push(value)
      }
    } finally { await reader?.cancel() }
    return new Response(Buffer.concat(chunks), { status: response.status, headers: response.headers })
  }
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: boundedFetch } }
  const client = createClient(credentials.url, credentials.publicKey, options)
  const signed = await client.auth.signInWithPassword({ email: credentials.email, password: credentials.password })
  const session = signed.data.session
  if (signed.error || !session || session.user.id !== credentials.accountId || session.user.is_anonymous || !session.access_token || !session.refresh_token || !session.expires_in || session.expires_in > 86400) throw new Error(unavailable)
  const verified = await client.auth.getUser(session.access_token)
  const user = verified.data.user
  if (verified.error || !user || user.id !== credentials.accountId || user.email !== credentials.email || user.is_anonymous !== false) throw new Error(unavailable)
  const actor = createClient(credentials.url, credentials.publicKey, { ...options, global: { fetch: boundedFetch, headers: { Authorization: `Bearer ${session.access_token}` } } })
  const result = await actor.rpc('get_account')
  const account = AccountSchema.safeParse(result.data)
  if (result.error || !account.success || completedAccountChapters(account.data).length !== 4) throw new Error(unavailable)
  // No password, configuration, provider detail, admin capability or profile defaults.
  return { access_token: session.access_token, refresh_token: session.refresh_token, expires_in: session.expires_in, token_type: session.token_type, user: { id: user.id } }
}

export function developmentLoginHandler(origin: string, authenticate = async () => authenticateDevelopmentAccount(await readDevelopmentCredentials())) {
  let busy = false
  return async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    if (request.url !== '/__dev/login') return next()
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('Content-Type', 'application/json')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    const reply = (status: number, body: unknown) => { response.statusCode = status; response.end(JSON.stringify(body)) }
    if (request.method !== 'POST') return reply(405, { error: 'POST required.' })
    if (request.headers.host !== new URL(origin).host || request.headers.origin !== origin || !loopback(request.socket.remoteAddress) || !loopback(request.socket.localAddress) || request.headers['x-forwarded-host'] || request.headers['x-forwarded-for'] || request.headers['sec-fetch-site'] === 'cross-site') return reply(403, { error: 'Local same-origin request required.' })
    if (request.headers['content-type'] !== 'application/json') return reply(415, { error: 'JSON required.' })
    if (busy) return reply(429, { error: 'Development sign-in already pending.' })
    busy = true
    const timer = setTimeout(() => request.destroy(), 2000)
    try {
      let body = ''
      for await (const chunk of request) {
        body += chunk.toString()
        if (Buffer.byteLength(body) > 1024) return reply(400, { error: 'Invalid intent.' })
      }
      clearTimeout(timer)
      const intent = z.object({ intent: z.literal('development-sign-in') }).strict().safeParse(JSON.parse(body))
      if (!intent.success) return reply(400, { error: 'Invalid intent.' })
      return reply(200, { session: await authenticate() })
    } catch { return reply(503, { error: unavailable }) }
    finally { clearTimeout(timer); busy = false }
  }
}

// Separate predicate is exported for fake-only tests; Vite's actual apply contract stays native.
export const developmentLoginEnabled = (command: string, mode: string) => command === 'serve' && mode === 'development'
export function developmentLoginPlugin(): Plugin {
  return {
    name: 'pebble-loopback-development-login',
    apply: (_config, environment) => developmentLoginEnabled(environment.command, environment.mode),
    configureServer(server) {
      if (server.config.mode !== 'development' || server.config.isProduction || server.config.server.host !== '127.0.0.1' || !server.config.server.strictPort) return
      server.middlewares.use(developmentLoginHandler(`http://127.0.0.1:${server.config.server.port}`))
    },
  }
}
