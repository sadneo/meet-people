import { createSbEngagedIngestionHandler } from '../_shared/sbengaged-ingestion.ts'
import { sbEngagedStore } from '../_shared/sbengaged-store.ts'

const backend = sbEngagedStore()
Deno.serve(createSbEngagedIngestionHandler({
  token: () => Deno.env.get('INGEST_TOKEN'), config: backend.runtimeConfig,
  store: () => backend.sync,
}))
