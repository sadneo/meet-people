import { createDiningBatchHandler } from '../_shared/dining-batch-ingestion.ts'
import { createDiningIngestionHandler } from '../_shared/dining-ingestion.ts'
import { getDiningStorage } from '../_shared/dining-storage.ts'
import { scrapeHospitalMenus } from '../_shared/hospital-menus.ts'
import { scrapeNutrisliceMenus } from '../_shared/nutrislice-menus.ts'

const shared = { token: () => Deno.env.get('INGEST_TOKEN'), storage: getDiningStorage }
Deno.serve(createDiningBatchHandler({
  nutrislice_sbu: createDiningIngestionHandler({ ...shared, source: 'nutrislice_sbu', scrape: scrapeNutrisliceMenus }),
  sbu_hospital: createDiningIngestionHandler({ ...shared, source: 'sbu_hospital', scrape: scrapeHospitalMenus }),
}))
