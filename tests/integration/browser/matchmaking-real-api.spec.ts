import { expect,test } from '@playwright/test'
import sharp from 'sharp'
import { mockMatchingSession } from '../../browser/matchmaking-fixture'
import { startOfflineBrowserApi,demoOwners,demoTokens } from '../offline/browser-api'

test('two users upload, find Friends, discover Dating, accept and message through actual API/SQL',async({browser},testInfo)=>{
 test.setTimeout(180000)
 const fixture=await startOfflineBrowserApi()
 const contexts=await Promise.all([browser.newContext({viewport:{width:390,height:844}}),browser.newContext({viewport:{width:1440,height:900}})])
 const pages=await Promise.all(contexts.map(context=>context.newPage()))
 const calls:string[]=[],external:string[]=[]
 try{
  await fixture.setup()
  for(const [index,page] of pages.entries()){
   await page.route('**/*',async route=>{
    const url=new URL(route.request().url())
    if(url.origin!=='http://127.0.0.1:3194'){external.push(url.origin);return route.abort()}
    if(!url.pathname.startsWith('/api/'))return route.continue()
    calls.push(`${index} ${route.request().method()} ${url.pathname}`)
    const response=await route.fetch({url:'http://127.0.0.1:3195'+url.pathname+url.search})
    return route.fulfill({response})
   })
   const which=index?'second':'first'
   await mockMatchingSession(page,true,0,{id:demoOwners[which],token:demoTokens[which]})
  }
  const [alex,morgan]=pages
  await morgan.goto('/profile')
  await morgan.getByRole('button',{name:'Profile picture',exact:true}).click()
  const dialog=morgan.getByRole('dialog',{name:'Your profile picture',exact:true})
  const image=await sharp({create:{width:600,height:800,channels:3,background:'#dfcbbd'}}).withExif({IFD0:{Artist:'Synthetic private camera'}}).jpeg().toBuffer()
  await dialog.getByLabel('Choose a picture').setInputFiles({name:'synthetic.jpg',mimeType:'image/jpeg',buffer:image})
  await dialog.getByRole('button',{name:'Upload profile photo',exact:true}).click()
  await expect(dialog).not.toBeVisible()
  await morgan.reload();await expect(morgan.locator('.account-portrait')).toHaveAttribute('src',/^blob:/)
  for(const page of pages){await page.goto('/matchmaking');await page.getByRole('button',{name:'Find Friends',exact:true}).click();await expect(page.getByRole('button',{name:'Check for a match',exact:true})).toBeVisible()}
  expect(calls.filter(path=>path.endsWith('/result'))).toEqual([])
  await alex.getByRole('button',{name:'Check for a match',exact:true}).click()
  await expect(alex.getByRole('heading',{name:'Morgan',exact:true})).toBeVisible()
  await expect(alex.getByRole('img',{name:"Morgan's profile photo",exact:true})).toHaveAttribute('src',/^blob:/)
  await alex.screenshot({path:testInfo.outputPath('friends-real-candidate.png')})
  for(const page of pages){await page.goto('/matchmaking?view=dating');await page.getByRole('button',{name:'Start Dating discovery',exact:true}).click();await expect(page.getByRole('button',{name:'Pause Dating discovery',exact:true})).toBeVisible()}
  await alex.getByRole('button',{name:'Find someone',exact:true}).click()
  await expect(alex.getByRole('img',{name:"Morgan's profile photo",exact:true})).toHaveAttribute('src',/^blob:/)
  await alex.screenshot({path:testInfo.outputPath('dating-real-candidate.png')})
  await alex.getByRole('button',{name:'Send connection request',exact:true}).click()
  await expect(alex.getByRole('status').filter({hasText:'Connection request sent.'})).toBeVisible()
  await morgan.goto('/messages');await morgan.getByRole('button',{name:'Accept',exact:true}).click()
  await morgan.getByRole('textbox',{name:'Message',exact:true}).fill('Actual browser to API to SQL hello')
  await morgan.getByRole('button',{name:'Send',exact:true}).click()
  await expect(morgan.getByRole('region',{name:'Message history'})).toContainText('Actual browser to API to SQL hello')
  await morgan.reload();await expect(morgan.getByRole('region',{name:'Message history'})).toContainText('Actual browser to API to SQL hello')
  await morgan.screenshot({path:testInfo.outputPath('real-accepted-message.png')})
  expect((await fixture.api('first','GET','/status')).mode).toBe('active')
  expect((await fixture.api('second','GET','/profile-photo')).hasPhoto).toBe(true)
  expect(external).toEqual([])
 }finally{
  await Promise.allSettled(contexts.map(context=>context.close()))
  await fixture.dispose()
 }
})
