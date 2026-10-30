import {test,expect,type Page} from '@playwright/test'
import {wiringFixture,user} from './wiring-fixture'
import {mockMatchingSession} from './matchmaking-fixture'
const key=`pebble:full-ui:community:v1:${user}`
test('Garden aliases use the sky composition, active navigation and sliding inventory tray',async({page})=>{
 await page.setViewportSize({width:390,height:860});await wiringFixture(page)
 for(const path of ['/community','/home']){
  await page.goto(path)
  await expect(page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Garden',exact:true})).toHaveAttribute('aria-current','page')
  await expect(page.locator('.integrated-sky-garden')).toHaveCSS('background-color','rgb(232, 239, 237)')
  await expect(page.locator('.integrated-sky-garden')).toHaveCSS('background-image','none')
 }
 const tray=page.getByRole('button',{name:'Open Garden inventory'})
 const box=(await tray.boundingBox())!
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y-30,{steps:6});await page.mouse.up()
 await expect(page.getByRole('dialog',{name:'Your garden',exact:true})).toBeVisible()
 await page.keyboard.press('Escape');await expect(tray).toBeFocused()
 await page.getByRole('button',{name:'An island for a future friend'}).nth(1).click()
 await expect(page.getByRole('dialog',{name:'Room for a new friend'})).toBeVisible()
 await page.getByRole('link',{name:'Discover people'}).click()
 await expect(page).toHaveURL(/\/matchmaking\?mode=friends/)
})
async function funds(page:Page){
 const menu=page.getByRole('complementary',{name:'Development navigation'})
 await menu.locator('summary').click();await page.getByRole('button',{name:'Add 1,000 test Pebbles'}).click();await page.getByRole('button',{name:'Add 1,000 test Pebbles'}).click();await menu.locator('summary').click()
}
for(const width of [390,1280])test(`Garden integration: drag, undo, four geodes, reset, reload ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:860});await wiringFixture(page);await page.goto('/')
 await expect(page.getByRole('heading',{name:'Your Garden'})).toBeVisible();await expect(page.getByText('Growing your Garden…')).toHaveCount(0)
 await page.getByRole('button',{name:'Open Garden inventory'}).click()
 const geode=page.locator('.garden-shop-item').filter({has:page.getByText('Mystery Geode',{exact:true})})
 await expect(geode.getByRole('button',{name:'Open',exact:true})).toBeDisabled()
 await page.getByRole('button',{name:'Close Garden inventory'}).click();await funds(page)
 await page.getByRole('button',{name:'Open Garden inventory'}).click()
 await page.locator('.garden-shop-item').filter({has:page.getByText('Garden Bench',{exact:true})}).getByRole('button',{name:'Build',exact:true}).click()
 const canvas=page.locator('.garden-canvas'),box=(await canvas.boundingBox())!,scale=Math.max(.16,Math.min((box.width-36)/1320,Math.max(180,box.height-240)/820,.85))
 const x=box.x+box.width/2+(540-724)*scale,y=box.y+box.height*.47+(790-590)*scale
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+48,y-24,{steps:8});await page.mouse.up()
 await expect.poll(()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)!).positions?.bench,key)).not.toBeUndefined()
 await page.getByRole('button',{name:'Open Garden inventory'}).click()
 await page.getByRole('button',{name:'Undo Garden change'}).click();expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)!).positions?.bench,key)).toBeUndefined()
 await page.getByRole('button',{name:'Undo Garden change'}).click();await expect(page.getByText('2,000 Pebbles available')).toBeVisible();await page.getByRole('button',{name:'Close Garden inventory'}).click()
 for(let i=0;i<4;i++){
  await page.getByRole('button',{name:'Open Garden inventory'}).click();await geode.getByRole('button',{name:'Open',exact:true}).click()
  await expect(page.locator('.garden-reveal')).toBeVisible();await page.getByRole('button',{name:'Keep in inventory'}).click();await page.getByRole('button',{name:'Close Garden inventory'}).click()
 }
 await page.getByRole('button',{name:'Open Garden inventory'}).click();await expect(page.getByRole('button',{name:'Undo Garden change'})).toBeDisabled();await expect(page.getByRole('button',{name:'Complete',exact:true})).toBeDisabled()
 await page.locator('.garden-shop-item').filter({has:page.getByText('Amethyst',{exact:true})}).getByRole('button',{name:'Place',exact:true}).click()
 await page.getByRole('button',{name:'Open Garden inventory'}).click();await page.getByRole('button',{name:'Reset Garden',exact:true}).click();await page.locator('.garden-confirm').getByRole('button',{name:'Reset Garden',exact:true}).click()
 await expect(page.locator('.garden-shop-item').filter({has:page.getByText('Amethyst',{exact:true})}).getByRole('button',{name:'Place',exact:true})).toBeEnabled()
 await page.getByRole('button',{name:'Close Garden inventory'}).click();await page.reload();await expect(page.getByRole('button',{name:'Build with 800 Pebbles'})).toBeVisible()
 await page.getByRole('button',{name:'Open Garden inventory'}).click();await expect(page.getByRole('button',{name:'Complete',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Close Garden inventory'}).click()
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 await page.screenshot({path:info.outputPath(`garden-${width}.png`),fullPage:true})
})

test('Garden fixed landscape, reduced motion and account isolation',async({page},info)=>{
 await page.setViewportSize({width:1280,height:860});await wiringFixture(page);await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');await funds(page)
 for(const name of ['River','Tree Cluster','Flower Meadow','Garnet']){
  await page.getByRole('button',{name:'Open Garden inventory'}).click()
  const item=page.locator('.garden-shop-item').filter({has:page.getByText(name,{exact:true})})
  if(name!=='Garnet')await expect(item).toContainText('Fixed landscape')
  await item.getByRole('button',{name:'Build',exact:true}).click()
 }
 await page.getByRole('button',{name:'Deselect item'}).click()
 const canvas=page.locator('.garden-canvas');await page.waitForTimeout(100)
 const before=await canvas.evaluate(el=>(el as HTMLCanvasElement).toDataURL());await page.waitForTimeout(400)
 expect(await canvas.evaluate(el=>(el as HTMLCanvasElement).toDataURL())).toBe(before)
 await page.screenshot({path:info.outputPath('garden-planted.png'),fullPage:true})
 await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(400)
 expect(await canvas.evaluate(el=>(el as HTMLCanvasElement).toDataURL())).not.toBe(before)
 const saved=await page.evaluate(k=>localStorage.getItem(k),key)
 await mockMatchingSession(page,true,0,{id:'a0000000-0000-4000-8000-000000000099',token:'other-fixture'});await page.reload()
 await expect(page.getByRole('button',{name:'Build with 0 Pebbles'})).toBeVisible()
 expect(await page.evaluate(k=>localStorage.getItem(k),key)).toBe(saved)
 await mockMatchingSession(page);await page.reload();await expect(page.getByRole('button',{name:'Build with 1535 Pebbles'})).toBeVisible()
})
