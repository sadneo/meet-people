import {test,expect} from '@playwright/test'
import {wiringFixture} from './wiring-fixture'

test('historical minors cannot mount private app surfaces and retain deletion access',async({page})=>{
 const fixture=await wiringFixture(page)
 fixture.getAccount().profile={...fixture.getAccount().profile!,birthdate:'2010-01-01'}
 let datingCalls=0;page.on('request',request=>{if(request.url().includes('/api/matchmaking/dating'))datingCalls++})
 for(const path of ['/matchmaking?mode=dating&preferences=true','/profile','/profile?section=dating','/profile?section=discovery','/messages/requests']){
  await page.goto(path)
  await expect(page.locator('main').first()).toBeVisible()
   await expect(page.getByRole('heading',{name:'Pebble is for adults 18 and older'})).toBeVisible()
   await expect(page.getByRole('button',{name:'Delete account',exact:true})).toBeVisible()
   await expect(page.getByRole('button',{name:'Dating',exact:true})).toHaveCount(0)
  await expect(page.getByRole('button',{name:'Dating Profile',exact:true})).toHaveCount(0)
  await expect(page.getByRole('switch',{name:'Dating discovery',exact:true})).toHaveCount(0)
  await expect(page.getByRole('link',{name:'Dating preferences',exact:false})).toHaveCount(0)
  await expect(page.getByText('Dating preferences',{exact:true})).toHaveCount(0)
 }
 expect(datingCalls).toBe(0)
})

test('incomplete historical minor onboarding is blocked rather than offering intentions',async({page})=>{
 const fixture=await wiringFixture(page)
 fixture.getAccount().completed=[0,1]
 fixture.getAccount().preferences.intents=[]
 fixture.getAccount().profile={...fixture.getAccount().profile!,birthdate:'2010-01-01'}
 await page.goto('/onboarding')
 await expect(page.getByRole('heading',{name:'Pebble is for adults 18 and older'})).toBeVisible()
 await expect(page.getByRole('checkbox',{name:/Make friends/})).toHaveCount(0)
 await expect(page.locator('main')).not.toContainText('Dating')
})
test('new dev onboarding rejects an under-18 birthday before saving',async({page})=>{
 const fixture=await wiringFixture(page,{fresh:true})
 await page.goto('/onboarding')
 await page.getByRole('button',{name:'Start my profile'}).click()
 await page.getByLabel('Display name',{exact:true}).fill('Test')
 await page.getByLabel('Username',{exact:true}).fill('fixture-child')
 await page.getByLabel('Birthdate · private').fill('2010-01-01')
 await page.getByLabel('City or campus area',{exact:true}).fill('Campus')
 await page.getByRole('button',{name:'Save & continue',exact:true}).click()
 await expect(page.getByRole('alert')).toHaveText('You must be at least 18 to use Pebble.')
 expect(fixture.calls.filter(c=>c.path==='/api/matchmaking/account'&&c.method==='PUT')).toHaveLength(0)
})
