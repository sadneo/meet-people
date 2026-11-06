// Real PostgreSQL acceptance, ONLY in a dedicated disposable container. No app DB reset.
// GARDEN_QA_CONTAINER=pebble-economy-qa-... node --test tests/integration/garden-economy.mjs
import { execFileSync, spawn } from 'node:child_process'
import process from 'node:process'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
const container=process.env.GARDEN_QA_CONTAINER
if(!container?.startsWith('pebble-economy-qa-'))throw new Error('A dedicated pebble-economy-qa-* container is required. Never use the app database.')
const args=['exec','-i',container,'psql','-X','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-Atq']
const sql=(source)=>execFileSync('docker',args,{input:source,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim()
const asyncSql=source=>new Promise((resolve,reject)=>{const p=spawn('docker',args);let out='',error='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>error+=d);p.on('close',code=>code?reject(new Error(error)):resolve(out.trim()));p.stdin.end(source)})
const quote=value=>`'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`
sql(`create table if not exists auth.users(id uuid primary key,email_confirmed_at timestamptz);
alter table auth.users add column if not exists email_confirmed_at timestamptz;
create or replace function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
create or replace function public.get_account() returns jsonb language sql stable as $$select jsonb_build_object('completed',case when current_setting('garden.qa.incomplete',true)='yes' then '[]'::jsonb else '[0,1,2,3]'::jsonb end)$$;`)
const migration=readFileSync('supabase/migrations/20261105000000_garden_economy.sql','utf8')
if(sql("select to_regclass('garden_private.wallets') is null")==='t')sql(migration)
else if(sql("select to_regprocedure('garden_private.account_v1(jsonb)') is null")==='t')sql(migration.slice(migration.indexOf('create or replace function public.garden_account')).replace('commit;',''))
const owner=()=>{const id=randomUUID();sql(`insert into auth.users(id,email_confirmed_at) values('${id}',now());`);return id}
const query=(id,command=null,extra='')=>`set role authenticated;set request.jwt.claim.sub='${id}';${extra}select public.garden_account(${command===null?'null':quote(command)});`
const read=id=>JSON.parse(sql(query(id)))
const command=(state,action,fields={})=>({requestId:randomUUID(),revision:state.revision,action,...fields})
const act=(id,action,fields={})=>JSON.parse(sql(query(id,command(read(id),action,fields))))

test('starts at 300 once; daily/profile rewards cannot be replayed or clock spoofed',()=>{
 const id=owner();assert.equal(read(id).community.balance,300);assert.equal(read(id).community.balance,300)
 let result=act(id,'check-in');assert.equal(result.community.balance,320);assert.equal(result.rewards.checkedIn,true)
 assert.equal(act(id,'check-in').community.balance,320)
 result=act(id,'profile-reward');assert.equal(result.community.balance,420)
 assert.equal(act(id,'profile-reward').community.balance,420)
 assert.throws(()=>sql(query(id,command(read(id),'check-in',{now:'2030-01-01'}))),/Invalid command/)
 assert.throws(()=>sql(query(id,command(read(id),'profile-reward'),"set garden.qa.incomplete='yes';")),/Finish onboarding/)
 assert.equal(sql(`select sum(amount) from garden_private.ledger where owner='${id}'`),'420')
})
test('fifth distinct UTC-week visit earns 50 once; old weeks do not count',()=>{
 const id=owner();read(id)
 sql(`insert into garden_private.ledger(owner,key,amount) select '${id}','daily:'||d::date,20 from generate_series(date_trunc('week',now() at time zone 'UTC'),date_trunc('week',now() at time zone 'UTC')+interval '6 days',interval '1 day') d where d::date<>(now() at time zone 'UTC')::date limit 4;
 insert into garden_private.ledger(owner,key,amount) values('${id}','daily:2020-01-01',20);`)
 const first=act(id,'check-in');assert.equal(first.community.balance,370);assert.equal(first.rewards.weekDays,5);assert.equal(first.rewards.weeklyBonus,true)
 assert.equal(act(id,'check-in').community.balance,370)
 const fresh=owner();read(fresh);sql(`insert into garden_private.ledger(owner,key,amount) values('${fresh}','daily:2020-01-01',20);`)
 assert.equal(act(fresh,'check-in').rewards.weekDays,1)
})
test('purchases/refunds/undo preserve earned credits; reset is not income',()=>{
 const id=owner();act(id,'build',{id:'bench'});act(id,'check-in')
 let result=act(id,'undo');assert.equal(result.community.balance,320);assert.deepEqual(result.community.owned,[])
 result=act(id,'build',{id:'hall'});assert.equal(result.community.balance,200)
 act(id,'move',{id:'hall',position:{x:700,y:455}})
 assert.throws(()=>act(id,'move',{id:'river',position:{x:700,y:455}}),/Cannot move/)
 assert.equal(act(id,'reset').community.balance,320);assert.equal(act(id,'reset').community.balance,320)
 assert.equal(act(id,'undo').community.balance,200)
 assert.equal(act(id,'remove',{id:'hall'}).community.balance,320)
 assert.throws(()=>act(id,'remove',{id:'hall'}),/Not placed/)
 assert.equal(sql(`select sum(amount) from garden_private.ledger where owner='${id}'`),'320')
})
test('four server-chosen geodes, free placement, reset retains unlocks, no rerolls',()=>{
 const id=owner();read(id)
 // Test funding is privileged fixture SQL, never an application endpoint.
 sql(`update garden_private.wallets set balance=1500 where owner='${id}';`)
 for(let i=0;i<4;i++)assert.equal(act(id,'geode').community.geodeUnlocks.length,i+1)
 let result=read(id);assert.equal(new Set(result.community.geodeUnlocks).size,4);assert.equal(result.community.balance,300);assert.equal(result.canUndo,false)
 assert.throws(()=>act(id,'geode'),/All collected/)
 const rock=result.community.geodeUnlocks[0];act(id,'build',{id:rock});result=act(id,'reset')
 assert.equal(result.community.balance,300);assert.equal(result.community.geodeUnlocks.length,4)
 assert.equal(act(id,'build',{id:rock}).community.balance,300)
 const poor=owner();act(poor,'build',{id:'bench'});assert.throws(()=>act(poor,'geode'),/Insufficient/)
 assert.throws(()=>act(poor,'build',{id:'amethyst'}),/Cannot purchase/)
})
test('concurrent retries are idempotent; stale writes and changed request reuse fail',async()=>{
 const id=owner(),initial=read(id),c=command(initial,'geode')
 const responses=await Promise.all([asyncSql(query(id,c)),asyncSql(query(id,c))])
 assert.deepEqual(JSON.parse(responses[0]).community,JSON.parse(responses[1]).community)
 assert.equal(read(id).community.balance,0);assert.equal(read(id).community.geodeUnlocks.length,1)
 assert.throws(()=>sql(query(id,{...c,action:'check-in'})),/Request reused/)
 assert.throws(()=>sql(query(id,command(initial,'check-in'))),/Stale garden/)
 const claim=command(read(id),'check-in');await Promise.all([asyncSql(query(id,claim)),asyncSql(query(id,claim))]);assert.equal(read(id).community.balance,20)
})
test('owner isolation, no direct writes, no anonymous rewards, confirmed accounts only',()=>{
 const a=owner(),b=owner();act(a,'check-in');assert.equal(read(b).community.balance,300)
 assert.throws(()=>sql(`set role authenticated;select * from garden_private.wallets;`),/permission denied/)
 assert.throws(()=>sql(`set role anon;select public.garden_account(null);`),/permission denied/)
 assert.throws(()=>sql(query(a,null,`set request.jwt.claims='{"is_anonymous":true}';`)),/Sign in required/)
 const unconfirmed=randomUUID();sql(`insert into auth.users(id) values('${unconfirmed}');`)
 assert.throws(()=>read(unconfirmed),/Confirmed account/)
 assert.throws(()=>act(a,'check-in',{balance:999999}),/Invalid command/)
})
test('per-account command throttle works even across sessions',()=>{
 const id=owner();read(id)
 sql(`insert into garden_private.receipts(owner,request_id,command) select '${id}',gen_random_uuid(),'{}'::jsonb from generate_series(1,60);`)
 assert.throws(()=>act(id,'check-in'),/Slow down/);assert.equal(read(id).community.balance,300)
})
