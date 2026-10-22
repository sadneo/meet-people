import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { URL } from 'node:url'

export const productSources = [
  'docs/dev-account-reconciliation.sql',
  'docs/profile-details-migration.sql',
  'docs/detailed-settings-migration.sql',
  'docs/safety-contact-guards-migration.sql',
  'docs/safety-owner-contact-migration.sql',
  'docs/social-contact-migration.sql',
  'docs/discovery-privacy-migration.sql',
  'docs/friends-search-preferences-migration.sql',
  'docs/dating-aggregate-migration.sql',
  'docs/search-location-migration.sql',
  'docs/active-nearby-migration.sql',
  'docs/profile-photo-migration.sql',
  'docs/dating-live-migration.sql',
  'docs/real-account-boundary.sql',
  'docs/friends-runtime-migration.sql',
]
export const productVersion = 'canonical-product-v1'
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
function section(source, start, end) {
  const first = source.indexOf(start), last = source.indexOf(end, first + start.length)
  if (first < 0 || last < first) throw new Error('Product schema source boundaries changed; review deployment sources.')
  return source.slice(first, last)
}
export function buildProductSchema() {
  const sources = productSources.map(path => {
    const source = read(path), start = source.indexOf('\nbegin;'), end = source.lastIndexOf('\ncommit;')
    if (start < 0 || end <= start || source.slice(end + '\ncommit;'.length).trim()) throw new Error(`Invalid transaction source: ${path}`)
    return `\n-- ${path}\n${source.slice(start + '\nbegin;'.length, end)}\n`
  })
  // Keep the already-installed UUID stores intact in a private archive. The
  // canonical dev contact implementation uses bigint storage and UUID aliases.
  // This transition is only admitted while the old contact universe is empty.
  const contactTables = section(read('supabase/migrations/20260925000000_init_schema.sql'), 'create table conversations (', '-- ============================================\n-- BLOCKS')
  const contactTrigger = section(read('supabase/migrations/20260925000004_connection_logic.sql'), 'create or replace function connections_after_update()', '-- ============================================\n-- get_incoming_requests')
  const setup = read('docs/production-contact-reconciliation.sql') + contactTables + contactTrigger + read('supabase/migrations/20260925000008_messaging.sql')
  const payload = setup + sources.join('\n')
  const hash = createHash('sha256').update(payload).digest('hex')
  const sql = `begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
select pg_advisory_xact_lock(hashtextextended('pebble.product-schema',0));
create schema if not exists deployment_private;
revoke all on schema deployment_private from public,anon,authenticated;
create table if not exists deployment_private.product_versions(version text primary key, source_hash text not null, installed_at timestamptz not null default now());
revoke all on deployment_private.product_versions from public,anon,authenticated;
do $$ begin if exists(select 1 from deployment_private.product_versions) then raise exception 'Product schema already installed; inspect version before changing it';end if;end $$;
${payload}
insert into deployment_private.product_versions(version,source_hash) values('${productVersion}','${hash}');
notify pgrst,'reload schema';
commit;
`
  return { sql, hash, version: productVersion }
}
