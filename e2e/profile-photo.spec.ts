import { expect,test } from '@playwright/test'
import sharp from 'sharp'
import { sharedProfileFixture } from './shared-profile-fixture'
for(const width of [320,390,1440])test(`private profile photo upload, reload and removal at ${width}`,async({page},testInfo)=>{
 await page.setViewportSize({width,height:width===1440?900:844})
 const fixture=await sharedProfileFixture(page)
 const image=await sharp({create:{width:256,height:384,channels:3,background:'#dfcbbd'}}).jpeg().toBuffer()
 let state={revision:0,hasPhoto:false,updatedAt:null as string|null},writes=0
 await page.route('**/api/matchmaking/profile-photo**',async route=>{
  const request=route.request(),url=new URL(request.url())
  if(request.method()==='PUT'||request.method()==='DELETE'){
   expect(Number(url.searchParams.get('expectedRevision'))).toBe(state.revision);expect(url.searchParams.get('requestId')).toMatch(/^[0-9a-f-]{36}$/)
   if(request.method()==='PUT'){expect(request.headers()['content-type']).toBe('image/jpeg');expect(request.postDataBuffer()).toEqual(image)}
   state={revision:state.revision+1,hasPhoto:request.method()==='PUT',updatedAt:'2026-10-19T12:00:00Z'};writes++
  }
  if(url.pathname==='/api/matchmaking/profile-photo')return route.fulfill({json:state})
  return state.hasPhoto?route.fulfill({body:image,contentType:'image/jpeg',headers:{'cache-control':'no-store'}}):route.fulfill({status:404,json:{error:'Photo unavailable.'}})
 })
 await page.goto('/profile');await page.getByRole('button',{name:'Profile picture',exact:true}).click()
 let dialog=page.getByRole('dialog',{name:'Your profile picture',exact:true})
 await expect(dialog.getByRole('button',{name:'Upload profile photo',exact:true})).toBeDisabled()
 await dialog.getByLabel('Choose a picture').setInputFiles({name:'synthetic.jpg',mimeType:'image/jpeg',buffer:image})
 await expect(dialog.getByRole('img',{name:'Selected photo, not uploaded yet'})).toBeVisible();expect(writes).toBe(0)
 await page.keyboard.press('Tab');await dialog.getByRole('button',{name:'Upload profile photo',exact:true}).focus();expect(await dialog.getByRole('button',{name:'Upload profile photo',exact:true}).evaluate(element=>getComputedStyle(element).outlineStyle)).toBe('solid')
 await page.screenshot({path:testInfo.outputPath('photo-upload.png')})
 expect(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true)
 await dialog.getByRole('button',{name:'Upload profile photo',exact:true}).click();await expect(dialog).not.toBeVisible();expect(writes).toBe(1)
 await expect(page.locator('.account-portrait')).toHaveAttribute('src',/^blob:/)
 await page.reload();await expect(page.locator('.account-portrait')).toHaveAttribute('src',/^blob:/)
 await page.getByRole('button',{name:'Profile picture',exact:true}).click();dialog=page.getByRole('dialog',{name:'Your profile picture',exact:true})
 await expect(dialog.getByRole('img',{name:'Your saved profile photo',exact:true})).toBeVisible()
 await page.screenshot({path:testInfo.outputPath('photo-saved.png')})
 await dialog.getByRole('button',{name:'Remove saved photo',exact:true}).click();await expect(dialog).not.toBeVisible();expect(writes).toBe(2)
 await expect(page.getByRole('img',{name:'Profile picture not set',exact:true})).toBeVisible()
 expect(fixture.calls.some(call=>call.method!=='GET'&&/\/(account|profile)$/.test(call.path))).toBe(false);expect(fixture.external).toEqual([])
})
