import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import console from 'node:console'
import { buildProductSchema } from './product-schema.mjs'

const ref = process.env.SUPABASE_PROJECT_REF
if (!/^[a-z]{20}$/.test(ref ?? '')) throw new Error('Set SUPABASE_PROJECT_REF to the deployment target.')
const bundle = buildProductSchema(), directory = mkdtempSync(join(tmpdir(), 'pebble-product-schema-'))
function query(source) {
  const path = join(directory, 'deployment.sql')
  writeFileSync(path, source, { mode: 0o600 })
  try {
    return JSON.parse(execFileSync('pnpm', ['exec', 'supabase', 'db', 'query', '--linked', '--project-ref', ref, '--file', path, '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 4 * 1024 * 1024 }))
  } catch { throw new Error('Product schema deployment failed. Transaction was not confirmed; inspect database state before retrying.') }
}
try {
  const [inventory] = query("select to_regclass('deployment_private.product_versions') is not null as installed")
  if (inventory.installed) {
    const versions = query('select version,source_hash from deployment_private.product_versions')
    if (versions.length !== 1 || versions[0].version !== bundle.version || versions[0].source_hash !== bundle.hash) throw new Error('Installed product schema differs from release sources; a forward migration is required.')
    console.info(`Product schema ${bundle.version} already installed; source hash verified.`)
  } else {
    query(bundle.sql)
    const [saved] = query('select version,source_hash from deployment_private.product_versions')
    if (saved?.version !== bundle.version || saved?.source_hash !== bundle.hash) throw new Error('Product schema readback failed.')
    console.info(`Installed product schema ${bundle.version}; source hash verified.`)
  }
} finally { rmSync(directory, { recursive: true, force: true }) }
