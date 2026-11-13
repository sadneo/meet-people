// Catalog-only inspection. Never link, repair, push, or invoke application RPCs.
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export function compareInventory(files, rows, functions) {
  const applied = new Set(rows.map(row => row.version))
  const versions = new Set(files.map(file => file.name.split('_')[0]))
  const expected = new Map()
  for (const file of files.filter(file => file.name.includes('push'))) {
    const pattern = /create\s+(?:or\s+replace\s+)?function\s+public\.(push_\w+)\s*\([\s\S]*?\bas\s+(\$\w*\$)([\s\S]*?)\2/gi
    for (const match of file.sql.matchAll(pattern)) expected.set(match[1], match[3])
  }
  const normalize = value => value.trim().replace(/\r\n?/g, '\n')
  return {
    appliedCount: applied.size,
    pending: files.filter(file => !applied.has(file.name.split('_')[0])).map(file => file.name).sort(),
    remoteOnly: [...applied].filter(version => !versions.has(version)).sort(),
    pushFunctionBodies: [...expected].map(([name, body]) => {
      const found = functions.filter(fn => fn.proname === name)
      return { name, status: found.length === 0 ? 'missing' : found.length > 1 ? 'ambiguous' : normalize(found[0].prosrc) === normalize(body) ? 'matches' : 'differs' }
    }),
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cwd = fileURLToPath(new URL('../', import.meta.url))
  const projectRef = 'wacgxhsdhrqigrmqaonc'
  const query = `BEGIN READ ONLY;
SELECT jsonb_build_object(
 'migrations',(SELECT coalesce(jsonb_agg(jsonb_build_object('version',version)),'[]') FROM supabase_migrations.schema_migrations),
 'functions',(SELECT coalesce(jsonb_agg(jsonb_build_object('proname',p.proname,'prosrc',p.prosrc)),'[]') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'push_%'),
 'gardenSchemaExists',to_regnamespace('garden_private') IS NOT NULL
) AS inventory; COMMIT;`
  const raw = execFileSync('pnpm', ['exec', 'supabase', 'db', 'query', '--linked', '--project-ref', projectRef, query], {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 4 * 1024 * 1024,
  })
  const result = JSON.parse(raw)
  const inventory = result.rows?.[0]?.inventory
  if (!inventory || !Array.isArray(inventory.migrations) || !Array.isArray(inventory.functions)) throw new Error('Unexpected CLI response; no audit result accepted.')
  const dir = new URL('../supabase/migrations/', import.meta.url)
  const files = readdirSync(dir).filter(name => name.endsWith('.sql')).map(name => ({ name, sql: readFileSync(new URL(name, dir), 'utf8') }))
  console.log(JSON.stringify({ projectRef, inspectedAt: new Date().toISOString(), ...compareInventory(files, inventory.migrations, inventory.functions), gardenSchemaExists: inventory.gardenSchemaExists,
    limitations: 'Function-body comparison does not verify signatures, grants, table constraints, indexes, triggers, or data. This audit is not a migration rehearsal.' }, null, 2))
}
