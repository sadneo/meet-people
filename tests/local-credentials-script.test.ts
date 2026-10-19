import { expect, it } from 'vitest'

// Import only pure guards: the reviewed live entrypoint is never invoked here.
const modulePath = '../scripts/validate-local-credentials.mjs'
const { loopbackUrl, disposableEmail, mailpitSearchUrl, mailpitMessageIds, mailpitText, failureDiagnostic, localJson } = await import(modulePath)
it('live-script endpoint guard refuses hosted, LAN, embedded credentials and misleading loopback names', () => {
  for (const url of ['https://hosted.example.test', 'http://192.168.1.12:54321', 'http://localhost.example.test', 'http://localhost.:3000', 'http://0.0.0.0:3000', 'http://user:secret@localhost:3000', 'file:///tmp/test', 'http://127.0.0.1:3000/#secret']) expect(() => loopbackUrl(url)).toThrow()
  for (const url of ['http://127.0.0.1:3000', 'http://localhost:54321', 'http://[::1]:54324']) expect(loopbackUrl(url).origin).toBe(new URL(url).origin)
})
it('live-script cleanup allowlist accepts only exact disposable addresses belonging to one run', () => {
  const run = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
  expect(disposableEmail(`credentials-${run}@example.test`, run)).toBe(`credentials-${run}@example.test`)
  for (const email of ['user@example.test', `credentials-${run}@example.com`, `credentials-other@example.test`, `credentials-${run}-unrelated@example.test`]) expect(() => disposableEmail(email, run)).toThrow()
})
it('Mailpit uses recipient-scoped search and uppercase message ID/Text/HTML fields', () => {
  const run = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
  const email = `credentials-${run}-changed@example.test`
  const url = new URL(mailpitSearchUrl('http://127.0.0.1:54324/', email, run))
  expect(url.pathname).toBe('/api/v1/search')
  expect(url.search).toBe(`?query=${encodeURIComponent(`to:${email}`)}`)
  expect(mailpitMessageIds({ messages: [{ ID: 'mail-123' }, { ID: 'mail-456' }] })).toEqual(['mail-123', 'mail-456'])
  expect(mailpitText({ Text: 'Code: 123456', HTML: '<a href="http://localhost/?a=1&amp;b=2">Confirm</a>' })).toBe('Code: 123456\n<a href="http://localhost/?a=1&b=2">Confirm</a>')
  expect(() => mailpitMessageIds([{ id: 'old-inbucket-format' }])).toThrow()
  expect(() => mailpitMessageIds({ messages: [{ ID: '../other-mailbox' }] })).toThrow()
  expect(() => mailpitSearchUrl('https://hosted.example.test', email, run)).toThrow()
  expect(() => mailpitSearchUrl('http://localhost:54324', 'unrelated@example.test', run)).toThrow()
})
it('diagnostics expose only allowlisted categories/stages and bounded canonical source line numbers', () => {
  const secret = 'private-password-token-and-address@example.test'
  const diagnostic = failureDiagnostic({ message: secret, stack: `Error: ${secret}\n    at main (file:///private/${secret}/validate-local-credentials.mjs:42:9)\n    at other (file:///private/credential-debug.mjs:100:1)` }, 'recovery')
  expect(diagnostic).toEqual({ failureCategory: 'browser-assertion-or-runtime', failureStage: 'recovery', failureSourceLines: [42] })
  expect(JSON.stringify(diagnostic)).not.toContain(secret)
  expect(failureDiagnostic({ message: 'non-loopback-endpoint', stack: '    at main (file:///tmp/validate-local-credentials.mjs:999999:1)' }, secret)).toEqual({ failureCategory: 'non-loopback-endpoint', failureStage: 'unknown', failureSourceLines: [] })
  // An arbitrary lowercase message must not become a report category.
  expect(failureDiagnostic(new Error('secret'), 'bootstrap').failureCategory).toBe('browser-assertion-or-runtime')
})
it('local GET retries have a fixed budget; mutations, redirects and non-loopback requests are never retried', async () => {
  const { vi } = await import('vitest')
  const wait = vi.fn(async () => {})
  const transport = vi.fn().mockRejectedValueOnce(new Error('private network detail')).mockResolvedValueOnce({ ok: false, status: 503 }).mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [] }) })
  expect(await localJson('http://localhost:54324/api/v1/search', {}, { transport, wait })).toEqual({ messages: [] })
  expect(transport).toHaveBeenCalledTimes(3)
  expect(wait.mock.calls).toEqual([[1000], [2000]])
  expect(transport.mock.calls[0][1].redirect).toBe('manual')
  const failed = vi.fn().mockRejectedValue(new Error('sensitive'))
  await expect(localJson('http://localhost:54324/api/v1/search', {}, { transport: failed, wait })).rejects.toThrow('local-read-retry-exhausted')
  expect(failed).toHaveBeenCalledTimes(3)
  failed.mockClear()
  await expect(localJson('http://localhost:54324/admin', { method: 'POST' }, { transport: failed, wait })).rejects.toThrow('local-http-failure')
  expect(failed).toHaveBeenCalledTimes(1)
  const redirected = vi.fn().mockResolvedValue({ ok: false, status: 302 })
  await expect(localJson('http://localhost:54324/api/v1/search', {}, { transport: redirected, wait })).rejects.toThrow()
  expect(redirected).toHaveBeenCalledTimes(1)
  failed.mockClear()
  await expect(localJson('https://hosted.example.test', {}, { transport: failed, wait })).rejects.toThrow('non-loopback-endpoint')
  expect(failed).not.toHaveBeenCalled()
})
