// @vitest-environment node
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../api/index.js'

const server = app.listen(0, '127.0.0.1')
let url: string

beforeAll(() => {
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())))

describe('API', () => {
  it('reports health', async () => {
    const response = await fetch(`${url}/api/health`)

    expect(response.ok).toBe(true)
    await expect(response.json()).resolves.toEqual({ status: 'ok' })
  })

  it('rejects invalid input', async () => {
    const response = await fetch(`${url}/api/hello?name=${'a'.repeat(101)}`)

    expect(response.status).toBe(400)
  })
})
