import { expect, it, vi } from 'vitest'
import { enrichedSbEngagedImage, fetchSbEngagedDetail, fetchSbEngagedDetails, selectSbEngagedDetails } from '../../supabase/functions/_shared/sbengaged-detail-enrichment.ts'
import { extractSbEngagedDetailImage } from '../../supabase/functions/_shared/extract-sbengaged-detail.ts'

it('spends the bounded detail budget on never-enriched pages before previously checked events', () => {
  const now = new Date('2026-10-30T12:00:00Z')
  const listings = Array.from({ length: 60 }, (_, i) => ({ external_id: String(i) }))
  const existing = new Map(listings.slice(0, 25).map(row => [row.external_id, { ...row, image_url: 'https://example.test/poster.jpg', details_synced_at: '2026-10-29T12:00:00Z' }]))
  expect(selectSbEngagedDetails(listings, existing, now, 25).map(row => row.external_id)).toEqual(listings.slice(25, 50).map(row => row.external_id))
  existing.set('26', { external_id: '26', image_url: null, details_synced_at: now.toISOString() })
  expect(selectSbEngagedDetails(listings, existing, now, 25).some(row => row.external_id === '26')).toBe(false)
})

it('refreshes image-less pages before stale posters and preserves a known poster when a detail refresh has no image', () => {
  const now = new Date('2026-10-30T12:00:00Z'), previous = '2026-10-29T12:00:00Z'
  const prior = { external_id: '1', image_url: 'https://example.test/poster.jpg', details_synced_at: previous }
  const missing = { external_id: '2', image_url: null, details_synced_at: previous }
  expect(selectSbEngagedDetails([prior, missing], new Map([[prior.external_id, prior], [missing.external_id, missing]]), now, 1)[0]).toBe(missing)
  expect(enrichedSbEngagedImage(prior, { externalId: '1', success: true, imageUrl: null, attempts: 1 }, now)).toEqual({ image_url: prior.image_url, details_synced_at: now.toISOString() })
  expect(enrichedSbEngagedImage(prior, { externalId: '1', success: false, attempts: 2 }, now)).toEqual({ image_url: prior.image_url, details_synced_at: previous })
})

it('reads Event graphs, ImageObjects, later valid array entries and actual banner fallbacks', () => {
  expect(extractSbEngagedDetailImage('<script type="application/ld+json">{"@graph":[{"@type":"Organization","image":"https://example.test/logo.png"},{"@type":"Event","image":[null,{"url":"/upload/poster.png"}]}]}</script>')).toBe('https://sbengaged.stonybrook.edu/upload/poster.png')
  expect(extractSbEngagedDetailImage('<meta content="https://example.test/poster.png?a=1&amp;b=2" name="twitter:image">')).toBe('https://example.test/poster.png?a=1&b=2')
  expect(extractSbEngagedDetailImage('<img src="/logo.png" alt="Campus logo"><img src="/upload/event.jpg" alt="Banner for Campus Mixer">')).toBe('https://sbengaged.stonybrook.edu/upload/event.jpg')
  expect(extractSbEngagedDetailImage('<img src="/logo.png" alt="Campus logo"><meta property="og:image" content="javascript:alert(1)">')).toBeNull()
})

it('bounds retries and Retry-After delays and counts actual source requests', async () => {
  const network = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '999999' } }))
    .mockResolvedValueOnce(new Response('<meta property="og:image" content="https://example.test/poster.jpg">'))
  const pause = vi.fn(async (_ms: number) => { void _ms })
  expect(await fetchSbEngagedDetail('123', network, pause)).toEqual({ externalId: '123', success: true, imageUrl: 'https://example.test/poster.jpg', attempts: 2 })
  expect(pause).toHaveBeenCalledExactlyOnceWith(5000)
  expect(network.mock.calls[0][0]).toBe('https://sbengaged.stonybrook.edu/rsvp_boot?id=123')
  expect(network.mock.calls[0][1]?.redirect).toBe('manual')
})

it('follows CampusGroups organization redirects only within SBU and bounds redirect chains', async () => {
  const network = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response('', { status: 302, headers: { location: '/athletics/rsvp_boot?id=123' } }))
    .mockResolvedValueOnce(new Response('<meta property="og:image" content="https://example.test/poster.jpg">'))
  expect(await fetchSbEngagedDetail('123', network)).toMatchObject({ success: true, attempts: 2, imageUrl: 'https://example.test/poster.jpg' })
  expect(network.mock.calls[1][0]).toBe('https://sbengaged.stonybrook.edu/athletics/rsvp_boot?id=123')
  const outside = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 302, headers: { location: 'https://other.test/page' } }))
  expect(await fetchSbEngagedDetail('123', outside)).toMatchObject({ success: false, attempts: 1 })
  expect(outside).toHaveBeenCalledOnce()
  const loop = vi.fn<typeof fetch>().mockImplementation(async () => new Response('', { status: 302, headers: { location: '/rsvp_boot?id=123' } }))
  expect(await fetchSbEngagedDetail('123', loop)).toMatchObject({ success: false, attempts: 4 })
  expect(loop).toHaveBeenCalledTimes(4)
})

it('does not fetch arbitrary URLs or repeatedly retry non-public events', async () => {
  const network = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 404 }))
  expect(await fetchSbEngagedDetail('https://other.test/', network)).toMatchObject({ success: false, attempts: 0 })
  expect(network).not.toHaveBeenCalled()
  expect(await fetchSbEngagedDetail('123', network)).toMatchObject({ success: false, attempts: 1 })
  expect(network).toHaveBeenCalledOnce()
})

const appShell = '<html><head><script type="module" src="/w/assets/index-current.js"></script></head><body><div id="root"></div></body></html>'

it('reads the public event photo when CampusGroups serves its JavaScript app shell', async () => {
  const network = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(appShell))
    .mockResolvedValueOnce(Response.json({ data: { event: { id: btoa('stonybrook:Event:123'), photo: { url: '/upload/poster.png?a=1&amp;b=2' } } } }))
  expect(await fetchSbEngagedDetail('123', network)).toEqual({ externalId: '123', success: true, attempts: 2, imageUrl: 'https://sbengaged.stonybrook.edu/upload/poster.png?a=1&b=2' })
  expect(network.mock.calls[1][0]).toBe('https://sbengaged.stonybrook.edu/api/v2/graphql')
  expect(JSON.parse(String(network.mock.calls[1][1]?.body))).toEqual({
    query: 'query EventPoster($id: ID!) { event(id: $id) { id photo { url } } }', variables: { id: btoa('stonybrook:Event:123') },
  })
  expect(network.mock.calls[1][1]).toMatchObject({ method: 'POST', redirect: 'error' })
})

it('does not record a successful photo check for GraphQL errors, missing events, wrong IDs or unsafe photos', async () => {
  for (const payload of [
    { errors: [{ message: 'not available' }], data: { event: null } },
    { data: { event: null } },
    { data: { event: { id: btoa('stonybrook:Event:456'), photo: { url: '/upload/other.png' } } } },
    { data: { event: { id: btoa('stonybrook:Event:123') } } },
    { data: { event: { id: btoa('stonybrook:Event:123'), photo: { url: 'javascript:alert(1)' } } } },
  ]) {
    const network = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(appShell)).mockResolvedValueOnce(Response.json(payload))
    expect(await fetchSbEngagedDetail('123', network)).toEqual({ externalId: '123', success: false, attempts: 2 })
  }
  const network = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(appShell)).mockResolvedValueOnce(new Response('', { status: 503 }))
  expect(await fetchSbEngagedDetail('123', network)).toMatchObject({ success: false, attempts: 2 })
})

it('accepts an explicitly posterless public event without choosing unrelated imagery', async () => {
  const network = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(appShell))
    .mockResolvedValueOnce(Response.json({ data: { event: { id: btoa('stonybrook:Event:123'), photo: null } } }))
  expect(await fetchSbEngagedDetail('123', network)).toEqual({ externalId: '123', success: true, imageUrl: null, attempts: 2 })
})

it('stops enrichment between four-page batches when its time budget is used', async () => {
  let elapsed = 0
  const load = vi.fn(async (externalId: string) => { elapsed += 15; return { externalId, success: true as const, imageUrl: null, attempts: 1 } })
  const results = await fetchSbEngagedDetails(['1', '2', '3', '4', '5', '6'], 45, load, () => elapsed)
  expect(results.map(result => result.externalId)).toEqual(['1', '2', '3', '4'])
  expect(load).toHaveBeenCalledTimes(4)
})
