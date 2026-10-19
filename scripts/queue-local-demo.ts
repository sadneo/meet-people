import { parseArgs } from 'node:util'
import { execFileSync,spawnSync } from 'node:child_process'
import { seedContainer } from './demo-seed/plan.js'
import { queueSelection,queueSql } from './demo-seed/queue.js'
const options=parseArgs({options:{count:{type:'string',default:'2'},start:{type:'string',default:'1'},leave:{type:'boolean'},'dry-run':{type:'boolean'}},args:process.argv.slice(2).filter(value=>value!=='--')}).values
try{
 const count=Number(options.count),start=Number(options.start),selected=queueSelection(count,start)
 if(options['dry-run'])console.log(`Preview only: ${options.leave?'remove from':'join'} Friends queue: ${selected.map(p=>p.email).join(', ')}. No database/network access.`)
 else{
  const metadata=JSON.parse(execFileSync('docker',['inspect','--format','{"running":{{json .State.Running}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}}}',seedContainer],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))
  if(!metadata.running||metadata.project!=='meet-people')throw new Error('Expected running local meet-people Supabase container; remote targets unsupported')
  const result=spawnSync('docker',['exec','-i',seedContainer,'psql','-X','-qAt','-U','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-d','postgres'],{input:queueSql(count,start,!!options.leave),encoding:'utf8',maxBuffer:131072})
  if(result.status!==0)throw new Error('Queue transaction rejected and rolled back. Check seeded identities, current preferences and trusted location expiry. No other accounts changed.')
  console.log(`${options.leave?'Removed':'Queued'} ${count} fictional demo account(s): ${selected.map(p=>p.email).join(', ')}.`)
  if(!options.leave)console.log('In your signed-in demo account, choose Find Friends → Check for a match. Real filters and safety rules apply; a candidate is not guaranteed. No request or connection was created.')
 }
}catch(error){console.error(error instanceof Error?error.message:'Local queue action failed');process.exitCode=1}
