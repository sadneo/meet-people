/** Explicit offline test utilities. No env files, app URLs or arbitrary DB target. */
import { execFileSync, spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
export const database='pebble_safety_owner_disposable'
export function disposable(container:string){
 assert.match(container,/^(?:pebble-safety-review-20261019(?:-fresh|-final)?|pebble-sprint-review-20261019)$/)
 const inspect=JSON.parse(execFileSync('docker',['inspect','--format','{"network":{{json .HostConfig.NetworkMode}},"ports":{{json .NetworkSettings.Ports}}}',container],{encoding:'utf8'}))
 assert.equal(inspect.network,'none');assert.deepEqual(inspect.ports,{})
 const sql=(source:string)=>{
  const result=spawnSync('docker',['exec','-i',container,'psql','-X','-qAt','-U','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-d',database],{input:source,encoding:'utf8'})
  if(result.status)return{data:null as unknown,error:{code:result.stderr.match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1]??'unknown'}}
  const last=result.stdout.trim().split('\n').at(-1);return{data:last?JSON.parse(last) as unknown:null,error:null}
 }
 const checked=(source:string)=>{const result=sql(source);assert.equal(result.error,null,JSON.stringify(result.error));return result.data}
 checked("do $$ begin if not exists(select 1 from public.safety_owner_disposable_marker where singleton and purpose='network-none-safety-owner-v1') then raise exception 'Wrong disposable';end if;end $$;")
 const literal=(value:unknown)=>value===null?'null':`'${String(value).replaceAll("'","''")}'`
 const rpc=(actor:string,name:string,args:unknown[]=[])=>{
  assert.match(actor,/^[0-9a-f-]{36}$/);assert.match(name,/^[a-z_]+$/)
  return Promise.resolve(sql(`begin;set local role authenticated;set local request.jwt.claim.sub=${literal(actor)};select public.${name}(${args.map(literal).join(',')})::text;commit;`))
 }
 return{sql,checked,literal,rpc}
}
