import { parseArgs } from 'node:util'
import { execFileSync, spawnSync } from 'node:child_process'
import { seedContainer } from './demo-seed/plan.js'
import { queueSelection } from './demo-seed/queue.js'
import { activeDemoSql } from './demo-seed/active.js'
try {
 const options = parseArgs({ options: { count:{type:'string',default:'2'}, start:{type:'string',default:'1'}, action:{type:'string',default:'join'}, 'new-friends':{type:'string',default:'2'}, 'enable-active':{type:'boolean'}, 'dry-run':{type:'boolean'} }, args:process.argv.slice(2).filter(value=>value!=='--') }).values
 const count=Number(options.count), start=Number(options.start), selected=queueSelection(count,start)
 const action=options.action as 'join'|'cancel'|'status'|'remove'
 const sql=activeDemoSql(count,start,action,Number(options['new-friends']),!!options['enable-active'])
 console.log(`${options['dry-run']?'Preview':'Local demo action'}: ${action} — ${selected.map(p=>p.email).join(', ')}`)
 if (options['dry-run']) console.log('No database/network access.')
 else {
  const metadata=JSON.parse(execFileSync('docker',['inspect','--format','{"running":{{json .State.Running}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}}}',seedContainer],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))
  if (!metadata.running || metadata.project!=='meet-people') throw new Error('Expected running local meet-people Supabase container; remote targets unsupported')
  const result=spawnSync('docker',['exec','-i',seedContainer,'psql','-X','-qAt','-U','postgres','-v','ON_ERROR_STOP=1','-d','postgres'],{input:sql,encoding:'utf8',maxBuffer:131072})
  if(result.status!==0) throw new Error(`Transaction rolled back. Check matching migrations, seed ownership, active policy, availability timezone and trusted search areas. ${result.stderr.trim()}`)
  if(action==='status') console.log(result.stdout.trim())
  console.log('Done. All selected actions committed.')
  if(action==='join') console.log('Run pnpm matchmaking:active:once, then open Messages → Find a group → Check. Proposals still require every member’s explicit acceptance; this tool never accepts for them.')
 }
} catch(error) { console.error(error instanceof Error?error.message:'Local demo action failed');process.exitCode=1 }
