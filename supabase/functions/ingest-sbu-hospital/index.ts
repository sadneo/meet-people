import { createDiningIngestionHandler } from '../_shared/dining-ingestion.ts'
import { getDiningStorage } from '../_shared/dining-storage.ts'
import { scrapeHospitalMenus } from '../_shared/hospital-menus.ts'

Deno.serve(createDiningIngestionHandler({
  source: 'sbu_hospital', token: () => Deno.env.get('INGEST_TOKEN'), storage: getDiningStorage, scrape: scrapeHospitalMenus,
}))
