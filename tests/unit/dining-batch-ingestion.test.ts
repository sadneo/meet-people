// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { createDiningBatchHandler } from '../../supabase/functions/_shared/dining-batch-ingestion.ts'
import { createDiningIngestionHandler } from '../../supabase/functions/_shared/dining-ingestion.ts'

const request = (token = 'secret') => new Request('https://example.test/ingest-dining', {
  method: 'POST', headers: { 'x-ingest-token': token }, body: JSON.stringify({ mode: 'full', dryRun: false }),
})

it('passes the same request body to both sources and reports their individual results', async () => {
  const source = (count: number) => vi.fn(async (input: Request) => {
    expect(await input.json()).toEqual({ mode: 'full', dryRun: false })
    expect(input.headers.get('x-ingest-token')).toBe('secret')
    return Response.json({ status: 'ok', storage: { upserted: count }, ingestionRun: { id: `run-${count}`, status: 'completed' },
      normalized: { accepted: count, skipped: 0, sample: ['menu details'] } })
  })
  const nutrislice = source(40), hospital = source(5)
  const response = await createDiningBatchHandler({ nutrislice_sbu: nutrislice, sbu_hospital: hospital })(request())
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ status: 'ok', results: [
    { source: 'nutrislice_sbu', httpStatus: 200, status: 'ok', storage: { upserted: 40 }, ingestionRun: { id: 'run-40', status: 'completed' }, normalized: { accepted: 40, skipped: 0 } },
    { source: 'sbu_hospital', httpStatus: 200, status: 'ok', storage: { upserted: 5 }, ingestionRun: { id: 'run-5', status: 'completed' }, normalized: { accepted: 5, skipped: 0 } },
  ] })
  expect(nutrislice).toHaveBeenCalledTimes(1)
  expect(hospital).toHaveBeenCalledTimes(1)
})

it('finishes the other source when one throws and does not expose the exception', async () => {
  const hospital = vi.fn(async () => Response.json({ status: 'ok', storage: { upserted: 5 } }))
  const response = await createDiningBatchHandler({
    nutrislice_sbu: async () => { throw new Error('private configuration') }, sbu_hospital: hospital,
  })(request())
  expect(response.status).toBe(502)
  const body = await response.json()
  expect(body.status).toBe('partial')
  expect(body.results[0]).toMatchObject({ source: 'nutrislice_sbu', error: 'dining_source_unavailable' })
  expect(body.results[1]).toMatchObject({ source: 'sbu_hospital', storage: { upserted: 5 } })
  expect(JSON.stringify(body)).not.toContain('private configuration')
  expect(hospital).toHaveBeenCalledTimes(1)
})

it('does not turn partial or failed source responses into success', async () => {
  for (const code of [200, 502]) {
    const response = await createDiningBatchHandler({
      nutrislice_sbu: async () => Response.json({ status: code === 200 ? 'partial' : 'failed' }, { status: code }),
      sbu_hospital: async () => Response.json({ status: 'ok' }),
    })(request())
    expect(response.status).toBe(code)
    expect((await response.json()).status).toBe('partial')
  }
})

it('preserves authentication and input validation before either source accesses storage or scrapes', async () => {
  const scrape = vi.fn(), storage = vi.fn()
  const common = { token: () => 'secret', scrape, storage }
  const handle = createDiningBatchHandler({
    nutrislice_sbu: createDiningIngestionHandler({ ...common, source: 'nutrislice_sbu' }),
    sbu_hospital: createDiningIngestionHandler({ ...common, source: 'sbu_hospital' }),
  })
  expect((await handle(request('wrong'))).status).toBe(401)
  const wrongMethod = await handle(new Request('https://example.test'))
  expect(wrongMethod.status).toBe(405)
  expect(wrongMethod.headers.get('Allow')).toBe('POST')
  expect((await handle(new Request('https://example.test', {
    method: 'POST', headers: { 'x-ingest-token': 'secret' }, body: '{',
  }))).status).toBe(400)
  expect(scrape).not.toHaveBeenCalled()
  expect(storage).not.toHaveBeenCalled()
})
