import express from 'express'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Duplex } from 'node:stream'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { boundedMatchingBodyError } from '../../api/matching-body-errors'
import { createMatchmakingRouter, type UserContextTransport } from '../../api/matchmaking'

const verify = vi.fn(async () => ({ id: 'a0000000-0000-4000-8000-000000000001' }))
const read = vi.fn(), write = vi.fn(), actor = vi.fn(() => ({ profileDetails: read, saveProfileDetails: write }))
const transport = { verify, actor } as unknown as UserContextTransport

// Real Express application + body parser over synthetic Node streams: no server,
// socket connection, configured app import, environment loading or network.
function request(path: string, body: string) {
  const app = express()
  app.use(express.json())
  app.use('/api/matchmaking', boundedMatchingBodyError, createMatchmakingRouter(transport))
  const handle: express.RequestHandler = app
  return new Promise<{ status: number; headers: ReturnType<ServerResponse['getHeaders']>; body: string }>((resolve, reject) => {
    const socket = new Duplex({ read() {}, write(_chunk, _encoding, done) { done() } })
    const req = new IncomingMessage(socket as never)
    req.method = 'PUT'; req.url = path
    req.headers = { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)), authorization: 'Bearer synthetic' }
    const res = new ServerResponse(req)
    let output = ''
    res.write = ((chunk: unknown) => { output += String(chunk); return true }) as typeof res.write
    res.end = ((chunk?: unknown) => {
      if (chunk !== undefined) output += String(chunk)
      resolve({ status: res.statusCode, headers: res.getHeaders(), body: output })
      return res
    }) as typeof res.end
    req.on('error', reject)
    handle(req as express.Request, res as express.Response, reject)
    req.push(Buffer.from(body)); req.complete = true; req.push(null)
  })
}
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network forbidden') })) })
afterEach(() => { vi.unstubAllGlobals() })
it('bounds malformed, scalar and oversized JSON using actual mounted case-insensitive route semantics', async () => {
  for (const path of ['/api/matchmaking/profile-details', '/API/MATCHMAKING/profile-details']) {
    for (const body of ['{"facts":', '42', JSON.stringify({ large: 'x'.repeat(110 * 1024) })]) {
      const result = await request(path, body)
      expect(result.status).toBe(400)
      expect(result.headers['content-type']).toContain('application/json')
      expect(result.headers['cache-control']).toBe('no-store')
      expect(JSON.parse(result.body)).toEqual({ code: 'invalid', error: 'Invalid matching request body.' })
    }
  }
  expect(verify).not.toHaveBeenCalled(); expect(actor).not.toHaveBeenCalled()
  expect(read).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled()
})
it('does not capture parser errors on a sibling path that Express does not mount', async () => {
  await expect(request('/api/matchmaking-other/profile-details', '{')).rejects.toMatchObject({ type: 'entity.parse.failed' })
  expect(verify).not.toHaveBeenCalled(); expect(actor).not.toHaveBeenCalled()
})
