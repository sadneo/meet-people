// Dedicated PostgreSQL only. Real reward SQL and existing contact/locking functions;
// minimal social tables and privileged disposable activity fixtures, not real-user auth.
import {execFileSync,spawn} from 'node:child_process'
import {readFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import {setTimeout} from 'node:timers'
const container=process.env.GARDEN_QA_CONTAINER
if(!container?.startsWith('pebble-economy-qa-'))throw new Error('Use only a dedicated pebble-economy-qa-* database.')
const args=['exec','-i',container,'psql','-X','-U','supabase_admin','-d','postgres','-Atq','-v','ON_ERROR_STOP=1']
const sql=source=>execFileSync('docker',args,{input:source,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim()
const asyncSql=source=>new Promise((resolve,reject)=>{const p=spawn('docker',args);let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('close',c=>c?reject(new Error(err)):resolve(out.trim()));p.stdin.end(source)})
if(sql("select to_regclass('garden_private.wallets') is null")==='t')throw new Error('Run garden-economy.mjs first in the disposable database.')
sql(`alter table auth.users add column if not exists created_at timestamptz default now();
alter table auth.users add column if not exists is_anonymous boolean default false;
create schema if not exists social_private;create schema if not exists safety_private;
create table if not exists public.profiles(id uuid primary key references auth.users(id),is_active boolean default true);
create table if not exists public.connections(id bigint generated always as identity primary key,user_a uuid,user_b uuid,status text,created_at timestamptz,responded_at timestamptz,unique(user_a,user_b));
create table if not exists public.blocks(blocker_id uuid,blocked_id uuid,primary key(blocker_id,blocked_id));
create table if not exists safety_private.revoked_connections(connection_id bigint primary key);
create table if not exists public.conversations(id uuid primary key,kind text,source_key text unique);
create table if not exists public.conversation_participants(conversation_id uuid,user_id uuid,joined_at timestamptz,joined_after_seq bigint default 0,left_at timestamptz,primary key(conversation_id,user_id));
create table if not exists public.messages(id uuid default gen_random_uuid(),conversation_id uuid,sender_id uuid,seq bigint generated always as identity,body text default 'QA fixture',created_at timestamptz);`)
// Load the exact, latest repository implementations of these authorization helpers.
const prerequisites=readFileSync('supabase/migrations/20261027000000_product_prerequisites.sql','utf8')
for(const name of ['public.safety_pair_allowed','safety_private.lock_pair','safety_private.contact_allowed','social_private.contact_allowed','social_private.lock_pair']){
 const functions=[...prerequisites.matchAll(new RegExp(`create (?:or replace )?function ${name.replaceAll('.','\\.')}\\([\\s\\S]*?\\$\\$;`,'g'))]
 assert.ok(functions.length,`Missing ${name}`)
 sql(functions.at(-1)[0].replace(/^create (?:or replace )?function/,'create or replace function'))
}
const beforeMigration=sql("select md5(string_agg(row_to_json(w)::text,',' order by owner)) from garden_private.wallets w")
const migration=readFileSync('supabase/migrations/20261105010000_garden_social_rewards.sql','utf8')
if(sql("select to_regprocedure('garden_private.account_v1(jsonb)') is null")==='t')sql(migration)
else sql(migration.slice(migration.indexOf('create function garden_private.social_candidates')).replaceAll('create function','create or replace function').replace('commit;',''))
assert.equal(sql("select md5(string_agg(row_to_json(w)::text,',' order by owner)) from garden_private.wallets w"),beforeMigration,'Migration must preserve existing wallet contents')
const owner=(age=20)=>{const id=randomUUID();sql(`insert into auth.users(id,email_confirmed_at,created_at,is_anonymous) values('${id}',now(),now()-interval '${age} days',false);insert into public.profiles(id) values('${id}');`);return id}
const query=(id,c=null)=>`set role authenticated;set request.jwt.claim.sub='${id}';select public.garden_account(${c===null?'null':"'"+JSON.stringify(c).replaceAll("'","''")+"'::jsonb"});`
const read=id=>JSON.parse(sql(query(id)))
const command=(id,action,fields={})=>({action,revision:read(id).revision,requestId:randomUUID(),...fields})
const act=(id,action,fields={})=>JSON.parse(sql(query(id,command(id,action,fields))))
const pair=(a,b)=>{const chat=randomUUID();sql(`insert into public.connections(user_a,user_b,status,created_at,responded_at) values(least('${a}'::uuid,'${b}'::uuid),greatest('${a}'::uuid,'${b}'::uuid),'accepted',now()-interval '20 days',now()-interval '20 days');
insert into public.conversations values('${chat}','direct','direct:'||least('${a}'::uuid,'${b}'::uuid)||':'||greatest('${a}'::uuid,'${b}'::uuid));
insert into public.conversation_participants(conversation_id,user_id,joined_at) values('${chat}','${a}',now()-interval '20 days'),('${chat}','${b}',now()-interval '20 days');`);return chat}
const exchange=(chat,a,b,times=["now()-interval '3 days'","now()-interval '1 day'"])=>sql(`insert into public.messages(conversation_id,sender_id,created_at) values ${times.flatMap(t=>[a,b].map(id=>`('${chat}','${id}',${t})`)).join(',')};`)

test('actual UTC check-in dates, not a fabricated sequence; local session timezone is irrelevant',()=>{
 const a=owner();read(a);sql(`insert into garden_private.ledger(owner,key,amount) values('${a}','daily:'||(date_trunc('week',now() at time zone 'UTC')::date),20),('${a}','daily:2020-01-01',20);`)
 const r=JSON.parse(sql("set timezone='Pacific/Honolulu';"+query(a))).rewards
 assert.deepEqual(r.checkInDays,[r.weekStart]);assert.equal(r.weekDays,1)
 const next=act(a,'check-in').rewards;assert.ok(next.checkInDays.includes(next.day));assert.equal(next.checkInDays.length,next.weekDays)
})
test('a two-day mutual connection pays 30 once; retry, reset, mode changes and reconnect cannot mint again',async()=>{
 const a=owner(),b=owner(),chat=pair(a,b);exchange(chat,a,b)
 assert.equal(read(a).rewards.social.connectionAvailable,true)
 const c=command(a,'connection-reward');const responses=await Promise.all([asyncSql(query(a,c)),asyncSql(query(a,c))]);assert.equal(JSON.parse(responses[0]).community.balance,330);assert.equal(JSON.parse(responses[1]).community.balance,330)
 assert.equal(read(a).rewards.social.connectionAvailable,false)
 assert.equal(act(b,'connection-reward').community.balance,330)
 act(a,'build',{id:'hall'});act(a,'reset');assert.equal(read(a).community.balance,330)
 sql(`delete from public.connections where user_a=least('${a}'::uuid,'${b}'::uuid) and user_b=greatest('${a}'::uuid,'${b}'::uuid);
 insert into public.connections(user_a,user_b,status,created_at,responded_at) values(least('${a}'::uuid,'${b}'::uuid),greatest('${a}'::uuid,'${b}'::uuid),'accepted',now()-interval '20 days',now()-interval '20 days');`)
 assert.throws(()=>act(a,'connection-reward'),/No eligible/)
 assert.throws(()=>sql(query(a,{...c,action:'keep-in-touch'})),/Request reused/)
 assert.throws(()=>act(a,'connection-reward',{peer:b,amount:500}),/Invalid command/)
 assert.equal(sql(`select sum(amount) from garden_private.ledger where owner='${a}'`),'330')
})
test('weekly connection cap is two; older weeks do not consume the new cap',()=>{
 const a=owner();for(let i=0;i<3;i++){const b=owner();exchange(pair(a,b),a,b)}
 act(a,'connection-reward');act(a,'connection-reward');assert.equal(read(a).community.balance,360)
 assert.equal(read(a).rewards.social.connectionAvailable,false);assert.throws(()=>act(a,'connection-reward'),/Weekly limit/)
 sql(`update garden_private.ledger set created_at=date_trunc('week',now() at time zone 'UTC') at time zone 'UTC'-interval '1 second' where owner='${a}' and key like 'connection:%';`)
 assert.equal(read(a).rewards.social.connectionAvailable,true);assert.equal(act(a,'connection-reward').community.balance,390)
})
test('spam, one-sided messages and midnight straddling cannot qualify; both accounts must be established',()=>{
 for(const mode of ['one-day','one-way','midnight','young','unconfirmed','anonymous']){
  const a=owner(),b=owner(mode==='young'?0:20),chat=pair(a,b)
  if(mode==='one-day')exchange(chat,a,b,Array(30).fill("now()-interval '1 hour'"))
  else if(mode==='one-way')exchange(chat,a,a)
  else if(mode==='midnight')exchange(chat,a,b,["date_trunc('day',now())-interval '1 minute'","date_trunc('day',now())+interval '1 minute'"])
  else exchange(chat,a,b)
  if(mode==='unconfirmed')sql(`update auth.users set email_confirmed_at=null where id='${b}';`)
  if(mode==='anonymous')sql(`update auth.users set is_anonymous=true where id='${b}';`)
  assert.equal(read(a).rewards.social.connectionAvailable,false,mode);assert.throws(()=>act(a,'connection-reward'),/No eligible/,mode)
 }
})
test('blocked, inactive, revoked, pending, left and hidden-history relationships cannot earn',()=>{
 for(const mode of ['blocked','inactive','revoked','pending','left','hidden','old','future']){
  const a=owner(),b=owner(),chat=pair(a,b);exchange(chat,a,b)
  if(mode==='blocked')sql(`insert into public.blocks values('${b}','${a}');`)
  if(mode==='inactive')sql(`update public.profiles set is_active=false where id='${b}';`)
  if(mode==='revoked')sql(`insert into safety_private.revoked_connections select id from public.connections where user_a=least('${a}'::uuid,'${b}'::uuid) and user_b=greatest('${a}'::uuid,'${b}'::uuid);`)
  if(mode==='pending')sql(`update public.connections set status='pending' where user_a=least('${a}'::uuid,'${b}'::uuid) and user_b=greatest('${a}'::uuid,'${b}'::uuid);`)
  if(mode==='left')sql(`update public.conversation_participants set left_at=now() where conversation_id='${chat}' and user_id='${b}';`)
  if(mode==='hidden')sql(`update public.conversation_participants set joined_after_seq=9999999 where conversation_id='${chat}';`)
  if(mode==='old')sql(`update public.messages set created_at=created_at-interval '40 days' where conversation_id='${chat}';`)
  if(mode==='future')sql(`update public.messages set created_at=created_at+interval '40 days' where conversation_id='${chat}';`)
  assert.equal(read(a).rewards.social.connectionAvailable,false,mode);assert.throws(()=>act(a,'connection-reward'),/No eligible/,mode)
 }
})
test('keep-in-touch is 20 once/week, needs a reward at least seven days old and fresh two-day mutual activity',()=>{
 const a=owner(),b=owner(),chat=pair(a,b);exchange(chat,a,b);act(a,'connection-reward')
 assert.throws(()=>act(a,'keep-in-touch'),/No eligible/)
 sql(`update garden_private.ledger set created_at=now()-interval '14 days' where owner='${a}' and key like 'connection:%';`)
 // Freeze only the disposable function clock for a Monday/Tuesday-independent fixture.
 // Wednesday week boundary; never alter the production migration or database clocks.
 const clock="timestamptz '2026-11-04 18:00:00+00'"
 const helper=migration.slice(migration.indexOf('create function garden_private.social_candidates'),migration.indexOf('revoke all on function garden_private.social_candidates')).replace('create function','create or replace function').replaceAll('statement_timestamp()',clock)
 const originals=sql("select pg_get_functiondef('garden_private.social_candidates(uuid,boolean)'::regprocedure)")
 try{
  sql(helper)
  sql(`update auth.users set created_at='2026-10-01' where id in('${a}','${b}');update public.connections set created_at='2026-10-01',responded_at='2026-10-01' where user_a=least('${a}'::uuid,'${b}'::uuid) and user_b=greatest('${a}'::uuid,'${b}'::uuid);update public.conversation_participants set joined_at='2026-10-01' where conversation_id='${chat}';update garden_private.ledger set created_at='2026-10-20' where owner='${a}' and key like 'connection:%';`)
  // Existing history alone is deliberately excluded from this fixed fixture window.
  sql(`update public.messages set created_at='2026-10-25' where conversation_id='${chat}';`)
  assert.equal(read(a).rewards.social.keepInTouchAvailable,false)
  exchange(chat,a,b,["timestamptz '2026-11-02 10:00:00+00'","timestamptz '2026-11-03 11:00:00+00'"])
  sql(`update garden_private.ledger set created_at='2026-10-27' where owner='${a}' and key like 'connection:%';`)
  assert.equal(read(a).rewards.social.keepInTouchAvailable,false,'Both exchange days must be seven days after the first reward')
  sql(`update garden_private.ledger set created_at='2026-10-20' where owner='${a}' and key like 'connection:%';`)
  assert.equal(read(a).rewards.social.keepInTouchAvailable,true)
  assert.equal(act(a,'keep-in-touch').community.balance,350)
  assert.equal(read(a).rewards.social.keepInTouchAvailable,false)
  assert.throws(()=>act(a,'keep-in-touch'),/Already collected/)
 }finally{sql(originals)}
})
test('private helpers stay inaccessible; stale writes and throttle apply to social claims',()=>{
 const a=owner(),b=owner();exchange(pair(a,b),a,b);const c=command(a,'connection-reward');act(a,'check-in')
 assert.throws(()=>sql(query(a,c)),/Stale garden/)
 for(const name of ['garden_private.account_v1(null)',`garden_private.social_candidates('${a}',false)`])assert.throws(()=>sql(`set role authenticated;select * from ${name};`),/permission denied/)
 sql(`insert into garden_private.receipts(owner,request_id,command) select '${a}',gen_random_uuid(),'{}' from generate_series(1,60);`)
 assert.throws(()=>act(a,'connection-reward'),/Slow down/)
})

test('a concurrent block wins before a waiting claim is credited',async()=>{
 const a=owner(),b=owner(),chat=pair(a,b);exchange(chat,a,b)
 const c=command(a,'connection-reward')
 // Hold the exact pair lock used by production blocking; this is disposable fixture SQL.
 const blocker=asyncSql(`begin;select social_private.lock_pair('${a}','${b}');insert into public.blocks values('${b}','${a}');select pg_sleep(1);commit;`)
 await new Promise(resolve=>setTimeout(resolve,150))
 await assert.rejects(asyncSql(query(a,c)),/no longer eligible|No eligible/)
 await blocker;assert.equal(read(a).community.balance,300)
})
