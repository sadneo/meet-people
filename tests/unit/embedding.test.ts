// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { embedInterest } from '../../supabase/functions/_shared/embedding'

it('fails closed, bounds inputs, validates provider output, and hides provider errors', async () => {
  const provider = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ embedding: { values: Array(3072).fill(0.1) } }))
  const config = { apiKey: 'provider-key', sharedSecret: 'private-secret', fetch: provider }
  const request = (text: unknown, secret = 'private-secret') => new Request('https://example.test', {
    method: 'POST', headers: { 'x-embed-secret': secret }, body: JSON.stringify({ text }),
  })
  expect((await embedInterest(request('Coffee'), { ...config, sharedSecret: undefined })).status).toBe(503)
  expect((await embedInterest(request('Coffee', 'wrong'), config)).status).toBe(401)
  expect((await embedInterest(request('x'.repeat(10001)), config)).status).toBe(400)
  expect(provider).not.toHaveBeenCalled()
  const success = await embedInterest(request('Coffee'), config)
  expect(success.status).toBe(200)
  expect((await success.json()).embedding).toHaveLength(3072)
  const [, options] = provider.mock.calls[0]
  expect(options?.signal).toBeInstanceOf(AbortSignal)
  expect(JSON.parse(options?.body as string).outputDimensionality).toBe(3072)
  provider.mockResolvedValueOnce(Response.json({ embedding: { values: [1] } }))
  expect((await embedInterest(request('Coffee'), config)).status).toBe(502)
  provider.mockRejectedValueOnce(new Error('provider-key and private input'))
  expect(await (await embedInterest(request('Coffee'), config)).json()).toEqual({ error: 'embedding_unavailable' })
})
