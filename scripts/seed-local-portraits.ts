import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { z } from 'zod'
import { demoPlan, seedContainer, seedMarker } from './demo-seed/plan.js'
import { demoInitialsPhoto, demoStockPortrait } from './demo-seed/photos.js'

const options = parseArgs({ options: { count: { type: 'string', default: '20' }, directory: { type: 'string', default: '/tmp/opencode/pebble-stock-portraits' }, 'dry-run': { type: 'boolean' }, 'restore-initials': { type: 'boolean' } } }).values
const count = z.coerce.number().int().min(2).max(20).parse(options.count)
if (options['dry-run']) {
  console.log(`Preview only: ${options['restore-initials'] ? 'restore initial avatars on' : 'import stock portraits for'} ${count} marked local demo accounts; preserve edited photos. No files, database or network accessed.`)
} else {
  const metadata = JSON.parse(execFileSync('docker', ['inspect', '--format', '{"running":{{json .State.Running}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}}}', seedContainer], { encoding: 'utf8' }))
  if (!metadata.running || metadata.project !== 'meet-people') throw new Error('Expected running local meet-people database; remote targets are unsupported')
  const sourceSchema = z.array(z.object({ id: z.number().int().positive(), index: z.number().int().min(1).max(20), pageUrl: z.string(), license: z.literal('https://www.pexels.com/license/') })).length(20)
  const directory = resolve(options.directory!)
  const sources = sourceSchema.parse(JSON.parse(readFileSync(resolve(directory, 'sources.json'), 'utf8')))
  if (new Set(sources.map(s => s.index)).size !== 20 || sources.some(s => s.pageUrl !== `https://www.pexels.com/photo/${s.id}/`)) throw new Error('Stock-photo provenance manifest is incomplete')
  const plan = demoPlan(count)
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`
  let sql = `begin;set local lock_timeout='5s';set local statement_timeout='60s';\n`
  for (const person of plan.sort((a, b) => a.id.localeCompare(b.id))) {
    const source = sources.find(s => s.index === person.index)!
    const initial = (await demoInitialsPhoto(person)).toString('base64')
    const stock = (await demoStockPortrait(readFileSync(resolve(directory, `${source.id}.jpg`)))).toString('base64')
    const replacement = options['restore-initials'] ? initial : stock
    const expected = options['restore-initials'] ? stock : initial
    sql += `do $$ declare old photo_private.photos;begin
 if not exists(select 1 from auth.users where id='${person.id}' and email=${quote(person.email)} and raw_app_meta_data->>'pebble_demo_seed'='${seedMarker}' and is_anonymous is false) then raise exception 'Local demo ownership missing';end if;
 perform pg_advisory_xact_lock(hashtextextended('pebble.photo.owner.v1:${person.id}',0));
 select * into old from photo_private.photos where user_id='${person.id}' for update;
 if old.jpeg=decode('${replacement}','base64') then raise notice 'DEMO_PHOTO_UNCHANGED';
 elsif old.jpeg=decode('${expected}','base64') ${options['restore-initials'] ? '' : 'or old.revision is null'} then
  perform set_config('request.jwt.claim.sub','${person.id}',true);
  perform set_config('request.jwt.claims','{"sub":"${person.id}","role":"authenticated"}',true);
  perform public.save_profile_photo(jsonb_build_object('expectedRevision',coalesce(old.revision,0),'requestId',gen_random_uuid(),'jpegBase64','${replacement}'));
  raise notice 'DEMO_PHOTO_UPDATED';
 else raise notice 'DEMO_PHOTO_PRESERVED';end if;
end $$;\n`
  }
  sql += 'commit;'
  const result = spawnSync('docker', ['exec', '-i', seedContainer, 'psql', '-X', '-q', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(`Local portrait transaction rejected; all photo changes rolled back. ${result.stderr}`)
  const total = (status: string) => (result.stderr.match(new RegExp(`DEMO_PHOTO_${status}`, 'g')) ?? []).length
  console.log(`Local demo portraits: ${total('UPDATED')} updated, ${total('UNCHANGED')} unchanged, ${total('PRESERVED')} owner-edited/removed photos preserved. No profile identities or preferences changed.`)
}
