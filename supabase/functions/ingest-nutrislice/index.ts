import { createDiningIngestionHandler } from '../_shared/dining-ingestion.ts'
import { getDiningStorage } from '../_shared/dining-storage.ts'
import { scrapeNutrisliceMenus } from '../_shared/nutrislice-menus.ts'

Deno.serve(createDiningIngestionHandler({
  source: 'nutrislice_sbu', token: () => Deno.env.get('INGEST_TOKEN'), storage: getDiningStorage, scrape: scrapeNutrisliceMenus,
}))
