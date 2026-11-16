import { sbEngagedStore } from '../_shared/sbengaged-store.ts'

Deno.serve(async request => {
  if (request.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405 })
  const supplied = request.headers.get('x-export-token')
  if (!supplied) return Response.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const backend = sbEngagedStore(), config = await backend.runtimeConfig()
    if (supplied !== config.exportToken) return Response.json({ error: 'unauthorized' }, { status: 401 })
    if (config.mode !== 'producer') return Response.json({ error: 'source_unavailable' }, { status: 503 })
    return Response.json(await backend.exportSnapshot(), { headers: { 'Cache-Control': 'private, no-store' } })
  }
  catch { return Response.json({ error: 'fresh_snapshot_unavailable' }, { status: 503 }) }
})
