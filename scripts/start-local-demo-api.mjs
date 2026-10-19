// Local-only launch: select the public anon key in memory, never print/write it.
// No .env file inspection, service-role client, provider changes or Auth bypass.
import { execFileSync,spawn } from 'node:child_process'
let key
try {
 const status=JSON.parse(execFileSync('pnpm',['exec','supabase','status','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:131072}))
 const local=new URL(status.API_URL)
 if(local.protocol!=='http:'||!['127.0.0.1','localhost'].includes(local.hostname)||local.port!=='54321')throw new Error()
 key=status.ANON_KEY
 if(typeof key!=='string'||JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role!=='anon')throw new Error()
}catch{console.error('Local Supabase public runtime configuration could not be confirmed. No configuration was printed or written.');process.exit(1)}
const runtime={...process.env,SUPABASE_URL:'http://127.0.0.1:54321',SUPABASE_PUBLISHABLE_KEY:key,PORT:'3001'}
delete runtime.SUPABASE_SERVICE_ROLE_KEY
const child=spawn('pnpm',['exec','tsx','watch','api/server.ts'],{env:runtime,stdio:'inherit'})
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal))
child.once('error',()=>{console.error('Local demo API could not start.');process.exit(1)})
child.once('exit',code=>process.exit(code??1))
