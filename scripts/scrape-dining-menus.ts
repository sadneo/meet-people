import { writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { parseDiningInput } from '../supabase/functions/_shared/dining-menus.ts'
import { scrapeHospitalMenus } from '../supabase/functions/_shared/hospital-menus.ts'
import { scrapeNutrisliceMenus } from '../supabase/functions/_shared/nutrislice-menus.ts'

// Read-only runner: no Supabase credentials or writes, including ingestion_runs.
const { values } = parseArgs({ options: {
  source: { type: 'string' }, mode: { type: 'string', default: 'smoke' },
  'start-date': { type: 'string' }, locations: { type: 'string' }, output: { type: 'string' },
} })
if (values.source !== 'nutrislice' && values.source !== 'hospital') {
  throw new Error('Use --source nutrislice|hospital [--mode smoke|full] [--start-date YYYY-MM-DD] [--locations slug,slug] [--output path.json]')
}
const now = new Date()
const input = parseDiningInput({ mode: values.mode, startDate: values['start-date'], locations: values.locations?.split(',') }, now)
if (!input) throw new Error('Invalid mode, start date, or location slugs')
const result = await (values.source === 'nutrislice' ? scrapeNutrisliceMenus : scrapeHospitalMenus)(input, now)
const status = result.issues.length ? (result.rows.length ? 'partial' : 'failed') : 'ok'
const output = JSON.stringify({ status, ...result }, null, 2) + '\n'
if (values.output) {
  await writeFile(values.output, output)
  console.log(JSON.stringify({ status, menus: result.rows.length, items: result.rows.reduce((n, row) => n + row.items.length, 0),
    requests: result.requestCount, issues: result.issues, output: values.output }))
} else process.stdout.write(output)
if (result.issues.length) process.exitCode = 1
