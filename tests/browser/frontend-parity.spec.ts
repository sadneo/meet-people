import {expect,test} from '@playwright/test'
import {wiringFixture,eventId,conversationId,user,peer} from './wiring-fixture'

test('account controls use focused disclosure rows without issuing credential changes on open',async({page})=>{
 const fixture=await wiringFixture(page);await page.goto('/profile?section=account')
 await expect(page.getByLabel('New email',{exact:true})).toBeHidden()
 await expect(page.getByLabel('New password',{exact:true})).toBeHidden()
 await page.locator('.credential-settings summary').filter({hasText:'Email'}).click()
 await expect(page.getByLabel('New email',{exact:true})).toBeVisible()
 await page.locator('.credential-settings summary').filter({hasText:'Change password'}).click()
 await expect(page.getByLabel('New password',{exact:true})).toBeVisible()
 await expect(page.getByLabel('Confirm password',{exact:true})).toBeVisible()
 expect(fixture.calls.filter(c=>c.method==='PUT'||c.method==='POST')).toHaveLength(0)
})

test('Discover interest actions use the saved profile and retain its minimum-interest rule',async({page})=>{
 const fixture=await wiringFixture(page)
 fixture.getAccount().profile!.interests=['Coffee']
 await page.route('**/api/matchmaking/friends/recommendations',route=>route.fulfill({json:{algorithmVersion:'friends-rules-v1',candidates:[{id:peer,name:'Taylor',age:23,city:null,bio:null,avatar:null,photoRevision:0,interests:['Coffee','Hiking'],areaDistanceMiles:2}]}}))
 await page.goto('/matchmaking')
 await page.getByRole('button',{name:'Coffee · shared interest',exact:true}).click()
 await page.getByRole('button',{name:'Remove from my interests'}).click()
 await expect(page.getByRole('dialog',{name:'Coffee'}).getByRole('alert')).toBeVisible()
 expect(fixture.calls.filter(c=>c.method==='PUT')).toHaveLength(0)
 await page.keyboard.press('Escape')
 await page.getByRole('button',{name:'Hiking',exact:true}).click()
 await page.getByRole('button',{name:'Add to my interests'}).click()
 await expect(page.getByRole('dialog')).toHaveCount(0)
 expect(fixture.getAccount().profile!.interests).toEqual(['Coffee','Hiking'])
 await page.reload()
 await expect(page.getByRole('button',{name:'Hiking · shared interest',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Coffee · shared interest',exact:true}).click()
 await page.getByRole('button',{name:'Remove from my interests'}).click()
 await expect(page.getByRole('dialog')).toHaveCount(0)
 expect(fixture.getAccount().profile!.interests).toEqual(['Hiking'])
})

test('waiting event group updates automatically when a proposal becomes available',async({page})=>{
 await page.clock.setFixedTime(new Date('2026-10-30T12:00:00Z'))
 await wiringFixture(page)
 let reads=0, ready=false
 await page.route('**/api/matchmaking/events/*/group-queue',route=>{
  reads++
  return route.fulfill({json:!ready?{state:'waiting',proposal:null}:{state:'proposal',proposal:{id:conversationId,eventId,members:[{id:user,name:'Sam',avatar:null},{id:peer,name:'Taylor',avatar:null}]}}})
 })
 await page.goto(`/events/${eventId}`)
 await expect(page.getByRole('heading',{name:'Waiting for a group'})).toBeVisible()
 const initialReads=reads;ready=true
 await expect(page.getByRole('heading',{name:'Suggested group'})).toBeVisible({timeout:8000})
 await expect(page.locator('.proposal-members').getByText('Taylor',{exact:true})).toBeVisible()
 expect(reads).toBeGreaterThan(initialReads)
})

test('Profile navigation leaves a deep-linked editor and follows browser history',async({page})=>{
 await wiringFixture(page);await page.goto('/profile?section=basics')
 await expect(page.getByRole('heading',{name:'Edit profile',exact:true})).toBeVisible()
 await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Profile',exact:true}).click()
 await expect(page).toHaveURL(/\/profile$/)
 await expect(page.getByRole('heading',{name:'Profile',exact:true})).toBeVisible()
 await page.goBack()
 await expect(page.getByRole('heading',{name:'Edit profile',exact:true})).toBeVisible()
 await page.goForward()
 await expect(page.getByRole('heading',{name:'Profile',exact:true})).toBeVisible()
})

test('marketing preview switches modes; policy Back preserves non-secret auth text',async({page})=>{
 await wiringFixture(page,{guest:true});await page.goto('/')
 const modes=page.getByRole('group',{name:'Preview a matching mode'})
 await modes.getByRole('button',{name:'Dating'}).click()
 await expect(modes.getByRole('button',{name:'Dating'})).toHaveAttribute('aria-pressed','true')
 await expect(page.locator('.welcome-profile img')).toHaveAttribute('src','/pebble/maya.jpg')
 await page.getByRole('link',{name:/Get started/}).click()
 await expect(page.getByText('Sign in or create an account to find your people.')).toBeVisible()
 await page.getByLabel('Email',{exact:true}).fill('review@example.test')
 await page.locator('.auth-footer').getByRole('link',{name:'Privacy',exact:true}).click()
 await page.getByRole('link',{name:'Back to sign in'}).click()
 await expect(page.getByLabel('Email',{exact:true})).toHaveValue('review@example.test')
})

for(const width of [390,1280])test(`prototype profile overview, preview, settings and plans navigation ${width}`,async({page})=>{
 await page.setViewportSize({width,height:860});const fixture=await wiringFixture(page);await page.goto('/profile')
 await expect(page.getByRole('button',{name:/About you Photo/})).toBeVisible()
 await page.getByRole('button',{name:'Preview',exact:true}).click()
 const preview=page.getByRole('dialog',{name:'Your profile',exact:true})
 await expect(preview).toBeVisible();await expect(preview.getByRole('heading',{name:'Sam',exact:true})).toBeVisible()
 await expect(preview).not.toContainText(fixture.getAccount().profile!.birthdate!)
 await page.keyboard.press('Escape')
 await page.locator('.pagehead').getByRole('link',{name:'Settings',exact:true}).click()
 await expect(page.locator('.profile-settings-links .account-row')).toHaveCount(5)
 await page.goto('/matches');await expect(page.getByRole('heading',{name:'From a hello to a “see you there.”'})).toBeVisible()
 await page.getByRole('button',{name:'Connections',exact:true}).click()
 await expect(page.getByRole('heading',{name:'Your connections',exact:true})).toBeVisible()
 await expect(page.getByRole('heading',{name:'Suggested event groups',exact:true})).toBeHidden()
 await page.getByRole('button',{name:'Past',exact:true}).click()
 await expect(page.getByText('Past-plan history isn’t available yet.')).toBeVisible()
 expect(fixture.calls.filter(c=>c.method==='PUT'||c.method==='POST')).toHaveLength(0)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})

test('Events accepts new responses without counts and Reset restores All without a stuck loader',async({page})=>{
 await wiringFixture(page,{guest:true})
 const event={id:eventId,title:'A real API-shaped event',description:null,category:'Music',starts_at:'2026-11-03T17:00:00Z',ends_at:null,location_name:'Campus',address:null,city:null,image_url:null,source:'Campus',source_url:null,status:'active',distance_miles:null}
 await page.route('**/api/events?*',route=>route.fulfill({json:{events:new URL(route.request().url()).searchParams.has('category')?[]:[event],categories:['Music','Food'],page:1,hasMore:false}}))
 await page.goto('/explore');await expect(page.getByRole('heading',{name:event.title})).toBeVisible()
 await page.getByRole('group',{name:'Event categories'}).getByRole('button',{name:'Food',exact:true}).click()
 await expect(page.getByText('No events here yet.',{exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Filter events',exact:true}).click()
 await page.getByRole('button',{name:'Reset filters',exact:true}).click()
 await page.getByRole('button',{name:'Done',exact:true}).click()
 await expect(page.getByRole('heading',{name:event.title})).toBeVisible()
 await expect(page.getByRole('group',{name:'Event categories'}).getByRole('button',{name:'All',exact:true})).toHaveAttribute('aria-pressed','true')
 await expect(page.getByText(/\d+ people looking/)).toHaveCount(0)
})

test('profile rejects an under-13 birthdate without writing it',async({page})=>{
 const fixture=await wiringFixture(page);await page.goto('/profile?section=basics')
 await page.getByLabel('Birthdate (private)',{exact:true}).fill('2020-01-01')
 await page.getByRole('button',{name:'Save changes',exact:true}).click()
 await expect(page.getByText('You must be at least 13 to use Pebble.')).toBeVisible()
 expect(fixture.calls.filter(c=>c.method==='PUT')).toHaveLength(0)
})

for(const mode of ['friends','dating',null] as const)test(`chat header uses recorded ${mode ?? 'unknown'} relationship and members come from the conversation`,async({page})=>{
 await wiringFixture(page,{conversationMode:mode});await page.goto(`/messages/chat?conversation=${conversationId}`)
 const header=page.locator('.chat-header')
 if(mode)await expect(header.locator('.connection-kind')).toHaveText(mode==='friends'?'Friends':'Dating')
 else await expect(header.locator('.connection-kind')).toHaveCount(0)
 await header.getByRole('button',{name:'View conversation members'}).click()
 const people=page.getByRole('dialog',{name:'Conversation members'})
 await expect(people.getByText('You',{exact:true})).toBeVisible()
 await expect(people.getByText('Taylor',{exact:true})).toBeVisible()
 await page.keyboard.press('Escape');await expect(people).toHaveCount(0)
})
