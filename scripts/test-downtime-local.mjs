import process from 'node:process';
import console from 'node:console';
if (process.env.PEBBLE_LOCAL_DOWNTIME_TEST !== '1') throw Error('Set PEBBLE_LOCAL_DOWNTIME_TEST=1 to authorize one disposable local Auth account. No Gemini calls.');
const { execFileSync } = await import('node:child_process');
const { chromium, expect } = await import('@playwright/test');
const { randomBytes } = await import('node:crypto');
const v=JSON.parse(execFileSync('pnpm',['exec','supabase','status','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
if(v.API_URL!=='http://127.0.0.1:54321') throw Error('Local-only Supabase required');
const queueRows=execFileSync('docker',['exec','supabase_db_meet-people','psql','-X','-U','postgres','-d','postgres','-Atc','select count(*) from public.queue_entries;'],{encoding:'utf8'}).trim();
if(queueRows!=='0') throw Error('Abort: populated queue could invoke Gemini. Empty isolated local queue required.');
async function auth(path,body,key=v.SERVICE_ROLE_KEY){
 const r=await globalThis.fetch(v.API_URL+'/auth/v1/'+path,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body)});
 if(!r.ok) throw Error('Local Auth operation failed: '+r.status);
 return r.json();
}
let user,browser;
try {
 const email='downtime-'+randomBytes(8).toString('hex')+'@example.test';
 user=await auth('admin/users',{email,password:randomBytes(32).toString('hex'),email_confirm:true});
 const link=await auth('admin/generate_link',{type:'magiclink',email});
 const session=await auth('verify',{type:'magiclink',token_hash:(link.properties??link).hashed_token},v.PUBLISHABLE_KEY??v.ANON_KEY);
 browser=await chromium.launch();
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',()=>errors.push('browser-error'));
 await page.goto('http://127.0.0.1:3000/downtime-matchmaking');
 await expect(page.getByRole('heading',{name:'Sign in to match'})).toBeVisible();
 await page.evaluate(async ({access_token,refresh_token})=>{
  const {supabase}=await import('/src/supabase.ts');
  const {error}=await supabase.auth.setSession({access_token,refresh_token});
  if(error)throw Error('Real local session import failed');
 },{access_token:session.access_token,refresh_token:session.refresh_token});
 await expect(page.getByRole('button',{name:'Preferences',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Preferences',exact:true}).click();
 await page.getByLabel('Username',{exact:true}).fill('downtime_'+randomBytes(6).toString('hex'));
 await page.getByLabel('Display name',{exact:true}).fill('Local downtime check');
 await page.getByRole('button',{name:'Add time window'}).click();
 await page.getByLabel('Start 1',{exact:true}).fill('21:00:00');
 await page.getByLabel('End 1',{exact:true}).fill('24:00:00');
 await page.getByRole('button',{name:'Save preferences'}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.getByText('Local downtime check',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Turn on downtime matching',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('downtime queue');
 await page.reload();
 await expect(page.getByRole('status')).toContainText('downtime queue');
 await expect(page.getByText('Local downtime check',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Check for a match',exact:true}).click();
 await expect(page.getByRole('heading',{name:'No candidate yet'})).toBeVisible();
 await page.getByRole('link',{name:'Active matchmaking',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('downtime queue');
 await page.goto('http://127.0.0.1:3000/downtime-matchmaking');
 await expect(page.getByRole('button',{name:'Pause downtime matching',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Pause downtime matching',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Ready when you are');
 await page.reload();await expect(page.getByRole('status')).toContainText('Ready when you are');
 if(errors.length)throw Error('Browser errors observed');
 console.log('REAL_BROWSER_DOWNTIME_PROFILE_SAVE_QUEUE_RELOAD_EMPTY_RESULT_NAVIGATION_PAUSE_PASS');
} finally {
 if(browser)await browser.close();
 if(user){
  const r=await globalThis.fetch(v.API_URL+'/auth/v1/admin/users/'+user.id,{method:'DELETE',headers:{apikey:v.SERVICE_ROLE_KEY,Authorization:'Bearer '+v.SERVICE_ROLE_KEY}});
  if(!r.ok){process.exitCode=1;console.error('LOCAL_TEST_ACCOUNT_CLEANUP_FAILED');}
  else console.log('LOCAL_TEST_ACCOUNT_DELETED');
 }
}
