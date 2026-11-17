// Local-only launch: select the public anon key in memory, never print/write it.
// No .env file inspection, service-role client, provider changes or Auth bypass.
import { spawn } from 'node:child_process'
import { freePorts } from './lib/ports.mjs'
import { assertLocalStack,requireStack,supabaseStatus } from './lib/stack.mjs'
const stack=requireStack()
let key
try {
 const status=supabaseStatus(stack)
 assertLocalStack(status.API_URL,stack)
 key=status.ANON_KEY
 if(typeof key!=='string'||JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role!=='anon')throw new Error()
}catch{console.error('Local Supabase public runtime configuration could not be confirmed. No configuration was printed or written.');process.exit(1)}
const [port]=await freePorts(1,[3001])
const runtime={...process.env,SUPABASE_URL:stack.apiUrl,SUPABASE_PUBLISHABLE_KEY:key,PORT:String(port)}
delete runtime.SUPABASE_SERVICE_ROLE_KEY
console.log(`Local demo API: http://127.0.0.1:${port}`)
const child=spawn('pnpm',['exec','tsx','watch','api/server.ts'],{env:runtime,stdio:'inherit'})
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal))
child.once('error',()=>{console.error('Local demo API could not start.');process.exit(1)})
child.once('exit',code=>process.exit(code??1))
