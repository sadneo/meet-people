import { runSbEngagedPhotoCycle } from '../_shared/sbengaged-photo-worker.ts'
import { sbEngagedStore } from '../_shared/sbengaged-store.ts'

Deno.serve(async request => {
  if (request.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405 })
  const token = Deno.env.get('INGEST_TOKEN')
  if (!token || request.headers.get('x-ingest-token') !== token) return Response.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const backend = sbEngagedStore()
    if ((await backend.runtimeConfig()).mode !== 'producer') return Response.json({ state: 'disabled', processed: 0 })
    return Response.json(await runSbEngagedPhotoCycle(backend.photos))
  }
  catch { return Response.json({ error: 'photo_cycle_unconfirmed' }, { status: 502 }) }
})
