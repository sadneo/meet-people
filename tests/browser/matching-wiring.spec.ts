import { expect,test } from '@playwright/test'
import { wiringFixture,user,peer } from './wiring-fixture'
const third='a0000000-0000-4000-8000-000000000003',proposalId='d0000000-0000-4000-8000-000000000001'

for(const {status,code} of [{status:429,code:'request_limit'},{status:429,code:undefined},{status:503,code:undefined}])test(`Discover distinguishes ${code==='request_limit'?'rate-limited':`uncertain HTTP ${status}`} connection requests without resending`,async({page})=>{
 await wiringFixture(page)
 let writes=0
 await page.route(`**/api/matchmaking/friends/requests/${peer}`,async route=>{
  writes++
  await route.fulfill({status,json:{code,error:status===429?'Daily request limit reached (10 per 24 hours). Try again later.':'Your Friends action may already be saved. Check Connections before retrying.'}})
 })
 if(code==='request_limit')await page.route('**/api/connections/request-allowance',route=>route.fulfill({json:writes?{limit:10,used:10,remaining:0,availableAt:new Date(Date.now()+3600000).toISOString()}:{limit:10,used:9,remaining:1,availableAt:null}}))
 await page.goto('/matchmaking')
 await page.getByRole('button',{name:'Connect',exact:true}).click()
 if(code==='request_limit'){
  await expect(page.getByRole('heading',{name:'You’ve reached today’s request limit.'})).toBeVisible()
  await expect(page.getByRole('button',{name:'Connect',exact:true})).toHaveCount(0)
  await expect(page.getByRole('link',{name:'Check Connections',exact:true})).toHaveCount(0)
 }else{
  await expect(page.getByText(/Taylor: request unconfirmed/)).toBeVisible()
  await expect(page.getByRole('link',{name:'Check Connections',exact:true})).toBeVisible()
 }
 expect(writes).toBe(1)
})

test('buffered Discover profiles advance while the refill request is held',async({page})=>{
 await wiringFixture(page)
 let reads=0,release:()=>void=()=>{}
 const held=new Promise<void>(resolve=>{release=resolve})
 await page.route('**/api/matchmaking/friends/recommendations',async route=>{
  reads++
  if(reads>1){await held;return route.fulfill({json:{algorithmVersion:'friends-rules-v1',candidates:[]}})}
  return route.fulfill({json:{algorithmVersion:'friends-rules-v1',candidates:[peer,third].map((id,index)=>({id,name:index?'Jordan':'Taylor',age:23,city:null,bio:null,avatar:null,photoRevision:0,interests:['Coffee'],areaDistanceMiles:2}))}})
 })
 try{
  await page.goto('/matchmaking')
  await expect(page.getByRole('heading',{name:'Taylor, 23'})).toBeVisible()
  await page.getByRole('button',{name:'Pass',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Jordan, 23'})).toBeVisible()
  await expect.poll(()=>reads).toBe(2)
 }finally{release()}
})

for(const viewport of [{width:320,height:568},{width:375,height:667}])test(`Messages queue and smaller roster require fresh consent at ${viewport.width}px`,async({page})=>{
 await page.setViewportSize(viewport)
 await wiringFixture(page)
 let state='idle',members=[user,peer,third].map((id,index)=>({id,name:['Sam','Taylor','Jordan'][index],age:23,response:'pending',avatar:null})),proposal=proposalId
 const writes:{path:string;body:Record<string,unknown>}[]=[]
 const status=()=>({enabled:true,state,entryId:state==='idle'?null:third,queuedAt:state==='idle'?null:new Date().toISOString(),groupId:null,proposal:['reserved','accepted'].includes(state)?{id:proposal,groupId:null,expiresAt:new Date(Date.now()+300000).toISOString(),members,meetingArea:'Campus library',commonWindow:null}:null})
 await page.route('**/api/matchmaking/active-friends/**',async route=>{
  const path=new URL(route.request().url()).pathname,body=route.request().postDataJSON()
  if(path.endsWith('/groups'))return route.fulfill({json:{groups:[]}})
  if(route.request().method()!=='GET'){
   writes.push({path,body})
   if(path.endsWith('/queue'))state='queued'
   if(path.endsWith('/check'))state='reserved'
   if(path.endsWith('/accept')){state='accepted';members=members.map(member=>member.id===user?{...member,response:'accepted'}:member)}
   if(path.endsWith('/smaller')){proposal=third;state='reserved';members=members.filter(member=>(body.memberIds as string[]).includes(member.id)).map(member=>({...member,response:'pending'}))}
  }
  return route.fulfill({json:status()})
 })
 await page.goto('/messages')
 await page.getByRole('button',{name:'Find a group',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'Find a group'})
 await dialog.getByRole('button',{name:'Find a group',exact:true}).click()
 await dialog.getByRole('button',{name:'Check for a group'}).click()
 await expect(dialog.getByText('Campus library · 3 people')).toBeVisible()
 await dialog.getByRole('button',{name:'Accept this group'}).click()
 await dialog.getByText('Propose a smaller group',{exact:true}).click()
 await dialog.getByLabel('Taylor',{exact:true}).check()
 await dialog.getByRole('button',{name:'Propose selected roster'}).click()
 await expect(dialog.getByRole('button',{name:'Accept this group'})).toBeVisible()
 await expect(dialog.getByText('Pending',{exact:true})).toHaveCount(2)
 expect(writes.filter(write=>write.path.endsWith('/accept'))).toHaveLength(1)
 expect(writes.find(write=>write.path.endsWith('/smaller'))?.body.memberIds).toEqual([user,peer])
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})

test('formed group chat reads and sends through group endpoints with idempotent retries',async({page})=>{
 await page.setViewportSize({width:320,height:568})
 await wiringFixture(page)
 const groupId='b0000000-0000-4000-8000-000000000001',createdAt=new Date().toISOString()
 const participants=[{id:user,display_name:'Sam',avatar_url:null,last_read_seq:0},{id:peer,display_name:'Taylor',avatar_url:null,last_read_seq:0}]
 const messages=[{id:crypto.randomUUID(),conversation_id:groupId,seq:1,sender_id:peer,body:'Group hello',created_at:createdAt}]
 let lost=false
 const writes:Record<string,unknown>[]=[]
 const group=()=>({id:groupId,name:'Coffee crew',targetSize:3,kind:'friends_group',createdAt,latestMessage:messages.at(-1),unreadCount:1,members:participants,searchState:'idle',readyMemberIds:[]})
 await page.route('**/api/matchmaking/active-friends/groups**',async route=>{
  const path=new URL(route.request().url()).pathname
  if(path.endsWith('/groups'))return route.fulfill({json:{groups:[group()]}})
  if(path.endsWith('/messages')){
   if(route.request().method()==='POST'){
    const body=route.request().postDataJSON();writes.push(body)
    if(!lost){lost=true;messages.push({id:crypto.randomUUID(),conversation_id:groupId,seq:2,sender_id:user,body:body.body,created_at:createdAt});return route.abort()}
    return route.fulfill({json:messages.at(-1)})
   }
   return route.fulfill({json:{messages,nextCursor:null}})
  }
  if(path.endsWith('/read'))return route.fulfill({json:{lastReadSeq:route.request().postDataJSON().seq}})
  return route.fulfill({json:group()})
 })
 await page.goto(`/messages/chat?group=${groupId}`)
 await expect(page.getByLabel('Message history').getByText('Group hello',{exact:true})).toBeVisible()
 await page.getByLabel('Message',{exact:true}).fill('Group reply')
 await page.getByRole('button',{name:'Send',exact:true}).click()
 await page.getByRole('button',{name:'Retry same message'}).click()
 await expect(page.getByLabel('Message history').getByText('Group reply',{exact:true})).toHaveCount(1)
 expect(writes).toHaveLength(2);expect(writes[0]).toEqual(writes[1])
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})
