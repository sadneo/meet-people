// Opt-in React -> real Express -> real PostgreSQL test. Only auth/onboarding are fixtures.
import { test,expect } from '@playwright/test'
import express from 'express'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import process from 'node:process'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createGardenRouter } from '../../api/garden'
import type { UserContextTransport } from '../../api/matchmaking'
import { wiringFixture } from './wiring-fixture'
import { mockMatchingSession } from './matchmaking-fixture'

test('account Garden earns and persists across two browsers through real API and SQL',async({page,browser})=>{
 const container=process.env.GARDEN_QA_CONTAINER
 test.skip(!container?.startsWith('pebble-economy-qa-'),'Requires the dedicated disposable economy QA database; never use an app database.')
 const sql=(source:string)=>new Promise<string>((resolve,reject)=>{
  const child=spawn('docker',['exec','-i',container!,'psql','-X','-U','supabase_admin','-d','postgres','-Atq','-v','ON_ERROR_STOP=1']);let output='',error=''
  child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>error+=data)
  child.on('close',code=>code?reject(new Error(error)):resolve(output.trim()));child.stdin.end(source)
 })
 const owner=randomUUID(),peer=randomUUID(),chat=randomUUID(),token='garden-db-qa'
 test.skip(await sql("select to_regprocedure('garden_private.social_candidates(uuid,boolean)') is null")==='t','Install the additive social reward migration in the disposable container first.')
 await sql(`insert into auth.users(id,email_confirmed_at,created_at,is_anonymous) values('${owner}',now(),now()-interval '20 days',false),('${peer}',now(),now()-interval '20 days',false);
 insert into public.profiles(id) values('${owner}'),('${peer}');
 insert into public.connections(user_a,user_b,status,created_at,responded_at) values(least('${owner}'::uuid,'${peer}'::uuid),greatest('${owner}'::uuid,'${peer}'::uuid),'accepted',now()-interval '10 days',now()-interval '10 days');
 insert into public.conversations values('${chat}','direct','direct:'||least('${owner}'::uuid,'${peer}'::uuid)||':'||greatest('${owner}'::uuid,'${peer}'::uuid));
 insert into public.conversation_participants(conversation_id,user_id,joined_at) values('${chat}','${owner}',now()-interval '10 days'),('${chat}','${peer}',now()-interval '10 days');
 insert into public.messages(conversation_id,sender_id,created_at) values('${chat}','${owner}',now()-interval '3 days'),('${chat}','${peer}',now()-interval '3 days'),('${chat}','${owner}',now()-interval '1 day'),('${chat}','${peer}',now()-interval '1 day');`)

 const app=express();app.use(express.json());app.use('/api/garden',createGardenRouter({
  verify:async(value:string)=>value===token?{id:owner}:null,
  actor:()=>({garden:async(command:unknown)=>({data:JSON.parse(await sql(`set role authenticated;set request.jwt.claim.sub='${owner}';select public.garden_account(${command===null?'null':"'"+JSON.stringify(command).replaceAll("'","''")+"'::jsonb"});`)),error:null})}),
 } as unknown as UserContextTransport))
 const server=await new Promise<Server>(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))})
 const context=await browser.newContext({viewport:{width:390,height:860}})
 try{
  const second=await context.newPage()
  for(const p of [page,second]){
   await wiringFixture(p);await mockMatchingSession(p,true,0,{id:owner,token})
   await p.route('**/api/garden',async route=>{const response=await route.fetch({url:`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/garden`});await route.fulfill({response})})
  }
  await page.goto('/home');await expect(page.getByRole('button',{name:'Build with 300 Pebbles'})).toBeVisible()
  await page.getByRole('button',{name:'How to earn Pebbles'}).click()
  const panel=page.getByRole('dialog',{name:'Earn Pebbles'})
  await panel.getByRole('button',{name:'Check in',exact:true}).click();await expect(panel.locator('.garden-collected-quests summary')).toHaveText('Collected (1)')
  await panel.getByRole('button',{name:'Collect',exact:true}).click();await expect(panel.locator('.garden-collected-quests summary')).toHaveText('Collected (2)')
  await panel.getByRole('button',{name:'Collect connection reward'}).click();await expect(panel.getByRole('button',{name:'Collect connection reward'})).toBeDisabled()
  await expect(panel.getByRole('listitem')).toHaveCount(7);await expect(panel.locator('.checked')).toHaveCount(1)
  await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Build with 450 Pebbles'})).toBeVisible()
  await page.getByRole('button',{name:'Open Garden inventory'}).click();await page.locator('summary[aria-label="Random Pebbles"]').click()
  await page.getByRole('button',{name:'Open',exact:true}).click();await expect(page.locator('.garden-reveal')).toBeVisible()
  const rock=await page.locator('#garden-reveal-title').innerText();await page.getByRole('button',{name:'Keep in inventory'}).click()
  await second.goto('http://127.0.0.1:3194/home');await expect(second.getByRole('button',{name:'Build with 150 Pebbles'})).toBeVisible()
  await second.getByRole('button',{name:'Open Garden inventory'}).click();await second.locator('summary[aria-label="Random Pebbles"]').click()
  await second.locator('.garden-shop-item').filter({has:second.getByText(rock,{exact:true})}).getByRole('button',{name:'Place',exact:true}).click()
  await second.getByRole('button',{name:'Open Garden inventory'}).click();await second.getByRole('button',{name:'Reset Garden',exact:true}).click()
  await second.locator('.garden-confirm').getByRole('button',{name:'Reset Garden',exact:true}).click();await expect(second.locator('.garden-confirm')).not.toBeVisible()
  await page.reload();await expect(page.getByRole('button',{name:'Build with 150 Pebbles'})).toBeVisible()
  await page.getByRole('button',{name:'How to earn Pebbles'}).click();await expect(page.locator('.garden-collected-quests summary')).toHaveText('Collected (2)')
  const wallet=JSON.parse(await sql(`select json_build_object('balance',balance,'unlocks',unlocks,'owned',owned) from garden_private.wallets where owner='${owner}'`))
  expect(wallet.balance).toBe(150);expect(wallet.unlocks).toHaveLength(1);expect(wallet.owned).toEqual([])
 }finally{await context.close();await new Promise<void>(resolve=>server.close(()=>resolve()))}
})
