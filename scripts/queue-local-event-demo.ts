import { parseArgs } from 'node:util'
import { execFileSync,spawnSync } from 'node:child_process'
import { z } from 'zod'
import { readDevelopmentCredentials } from '../dev/development-login.js'
import { DevelopmentAnchorSchema } from './demo-seed/development.js'
import { eventQueueSql } from './demo-seed/event.js'
import { seedContainer } from './demo-seed/plan.js'

const flags=parseArgs({options:{'event-id':{type:'string'},all:{type:'boolean'},count:{type:'string'},'dry-run':{type:'boolean'}},args:process.argv.slice(2).filter(value=>value!=='--')}).values
function sql(source:string){
 const result=spawnSync('docker',['exec','-i',seedContainer,'psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:source,encoding:'utf8',maxBuffer:131072})
 if(result.status!==0)throw new Error('Event fixture transaction rejected. Check event availability, eligible demo profiles and the required development join for --event-id. This event rolled back; earlier events in a bulk run remain populated.')
 return result.stdout.trim()
}
async function main(){
 if(!!flags.all===!!flags['event-id'])throw new Error('Choose either --all or --event-id <event UUID>')
 const id=flags.all?null:z.uuid().parse(flags['event-id']),count=z.coerce.number().int().min(1).max(50).parse(flags.count??17)
 if(flags['dry-run']){console.log(`Preview: queue ${count} existing labeled test profiles for ${flags.all?'every future active event':`/events/${id} (development account must already be queued)`}. No event/profile edits or provider calls.`);return}
 const metadata=JSON.parse(execFileSync('docker',['inspect','--format','{"running":{{json .State.Running}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}}}',seedContainer],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))
 if(!metadata.running||metadata.project!=='meet-people')throw new Error('Verified local meet-people Supabase required')
 let credentials:Awaited<ReturnType<typeof readDevelopmentCredentials>>
 try{credentials=await readDevelopmentCredentials()}catch{throw new Error('Private development account configuration unavailable')}
 if(credentials.url!=='http://127.0.0.1:54321')throw new Error('Refusing a nonlocal development account')
 const row=sql(`select jsonb_build_object('id',p.id,'email',u.email,'username',p.username) from public.profiles p join auth.users u on u.id=p.id where u.id='${credentials.accountId}' and u.raw_app_meta_data->'pebble_development'='true'::jsonb;`)
 const primary=DevelopmentAnchorSchema.parse(JSON.parse(row))
 if(primary.email!==credentials.email)throw new Error('Development account ownership changed')
 const ids=id?[id]:z.array(z.uuid()).parse(JSON.parse(sql("select coalesce(jsonb_agg(id order by starts_at,id),'[]'::jsonb) from public.listings where listing_type='event' and status in('active','rescheduled') and starts_at>clock_timestamp();")))
 let completed=0
 for(const eventId of ids){
  const result=z.object({eventId:z.uuid(),title:z.string(),testProfiles:z.number()}).parse(JSON.parse(sql(eventQueueSql(eventId,primary,count,!flags.all))))
  completed++
  if(!flags.all)console.log(`${result.title}: ${result.testProfiles} labeled test profiles queued. /events/${result.eventId}`)
 }
 console.log(`${completed} events populated with ${count} labeled test profiles each. Join any populated event, then Refresh group status. Keep pnpm dev:groups running. Started/cancelled events are excluded; listings and your existing queue choices are preserved.`)
}
main().catch(error=>{console.error(error instanceof z.ZodError?'Use --event-id <event UUID> and optionally --count 1–50.':error instanceof Error?error.message:'Local event population failed');process.exitCode=1})
