import { spawnSync, execFileSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import { seedIdentity, seedMarker, seedContainer } from './demo-seed/plan.js'

const options = parseArgs({ options: { 'dry-run': { type: 'boolean' } } }).values
const actor = 'd0000000-0000-4000-8000-000000000001'
const selected = [2, 3, 5].map(seedIdentity), pending = seedIdentity(7)
if (options['dry-run']) {
  console.log('Preview: three local development conversations, nine fictional messages, one pending request. No database access.')
} else {
  const metadata = JSON.parse(execFileSync('docker', ['inspect', '--format', '{"running":{{json .State.Running}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}}}', seedContainer], { encoding: 'utf8' }))
  if (!metadata.running || metadata.project !== 'meet-people') throw new Error('Expected local meet-people database; no remote targets supported')
  const text = (value: string) => `'${value.replaceAll("'", "''")}'`
  const claims = (id: string) => `perform set_config('request.jwt.claim.sub','${id}',true);perform set_config('request.jwt.claims','{"sub":"${id}","role":"authenticated"}',true);`
  let sql = `begin;set local lock_timeout='5s';set local statement_timeout='60s';
do $$ begin
 if not exists(select 1 from auth.users where id='${actor}' and email='pebble-development@example.test' and raw_app_meta_data->>'pebble_development'='local-development-v1') then raise exception 'Development account ownership missing';end if;
`
  for (const person of [...selected, pending]) sql += `if not exists(select 1 from auth.users where id='${person.id}' and email=${text(person.email)} and raw_app_meta_data->>'pebble_demo_seed'='${seedMarker}') then raise exception 'Reserved demo identity missing or not owned';end if;\n`
  sql += 'end $$;set local role authenticated;\n'
  selected.forEach((person, index) => {
    const intro = 'Fictional local demo chat. Messages here are saved locally; this account does not reply automatically.'
    const reply = ['Coffee after class sounds good. Want to pick a campus café?', 'There is a good walking trail near campus. Have you tried it?', 'A study break and a board game sound like a good plan.'][index]
    const requestId = (step: number) => `c1000000-0000-4000-8000-${String((index + 1) * 10 + step).padStart(12, '0')}`
    sql += `do $$ declare state jsonb; chat uuid;begin
${claims(actor)}
state:=public.social_connection('${person.id}','get');
if state->>'status'='incoming' then perform public.friends_discovery_connection('${person.id}','accept');
elsif state->>'status'<>'connected' then perform public.friends_discovery_connection('${person.id}','request');end if;
${claims(person.id)}
state:=public.friends_discovery_connection('${actor}','accept');
chat:=(state->>'conversationId')::uuid;
if chat is null then raise exception 'Demo conversation was not established';end if;
perform public.social_send(chat,${text(intro)},'${requestId(1)}');
${claims(actor)}
perform public.social_send(chat,'Local demo: testing the conversation view.','${requestId(2)}');
${claims(person.id)}
perform public.social_send(chat,${text(reply)},'${requestId(3)}');
end $$;\n`
  })
  sql += `do $$ declare state jsonb;begin
${claims(pending.id)}
state:=public.social_connection('${actor}','get');
if state->>'status'='none' then perform public.friends_discovery_connection('${actor}','request');end if;
end $$;commit;`
  const result = spawnSync('docker', ['exec', '-i', seedContainer, 'psql', '-X', '-q', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`Local demo chat transaction rejected; no partial writes committed. ${result.stderr}`)
  console.log('Ready: three local demo conversations, nine idempotently seeded messages, and one request (unless already resolved). Existing chats and messages preserved.')
}
