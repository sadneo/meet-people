import { expect, test } from '@playwright/test'
import { wiringFixture, user } from './wiring-fixture'

test.use({ viewport: { width: 320, height: 568 }, reducedMotion: 'reduce' })
test('same-account tabs preserve purchases and update displayed balances',async({page,context})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message))
 await wiringFixture(page);await page.goto('/')
 await page.evaluate(owner=>localStorage.setItem(`pebble:full-ui:community:v1:${owner}`,JSON.stringify({balance:1000,owned:[],earnedChapters:[]})),user)
 await page.reload()
 const second=await context.newPage();await wiringFixture(second);await second.goto('/')
 await expect(second.getByRole('button',{name:'Build with 1000 Pebbles',exact:true})).toBeEnabled()
 for(const [tab,section,item] of [[page,'Decorations','Garden Bench'],[second,'Landscape','River']] as const){
  await tab.getByRole('button',{name:'Open Garden inventory',exact:true}).click()
  await tab.getByLabel(section,{exact:true}).click()
  await tab.locator('.garden-shop-item').filter({has:tab.getByText(item,{exact:true})}).getByRole('button',{name:'Build',exact:true}).click()
 }
 await expect(page.getByRole('button',{name:'Build with 905 Pebbles',exact:true})).toBeVisible()
 await expect(second.getByRole('button',{name:'Build with 905 Pebbles',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Open Garden inventory',exact:true}).click()
 await expect(page.getByRole('button',{name:'Undo Garden change',exact:true})).toBeDisabled()
 await page.getByRole('button',{name:'Close Garden inventory',exact:true}).click()
 await page.reload()
 expect(await page.evaluate(owner=>JSON.parse(localStorage.getItem(`pebble:full-ui:community:v1:${owner}`)!),user)).toMatchObject({balance:905,owned:['bench','river']})
 await page.screenshot({path:test.info().outputPath('two-tabs-after.png')})
 expect(errors).toEqual([])
})
test('200 percent text keeps full catalog rows and sheet controls reachable at 320x568',async({page})=>{
 await wiringFixture(page);await page.goto('/')
 await page.getByRole('button',{name:'Open Garden inventory',exact:true}).click()
 await page.evaluate(()=>{
  const elements=[...document.querySelectorAll<HTMLElement>('body *')].filter(element=>!element.closest('svg'))
  const sizes=elements.map(element=>{const style=getComputedStyle(element);return [parseFloat(style.fontSize)*2,parseFloat(style.lineHeight)*2]})
  elements.forEach((element,index)=>{element.style.fontSize=`${sizes[index][0]}px`;if(Number.isFinite(sizes[index][1]))element.style.lineHeight=`${sizes[index][1]}px`})
 })
 await page.getByLabel('Landscape',{exact:true}).click()
 const row=page.locator('.garden-shop-item').filter({has:page.getByText('Grass Details',{exact:true})})
 await row.scrollIntoViewIfNeeded()
 const visible=await row.evaluate(element=>{
  const row=element.getBoundingClientRect();let top=row.top,bottom=row.bottom
  for(let parent=element.parentElement;parent;parent=parent.parentElement){if(/auto|scroll|hidden/.test(getComputedStyle(parent).overflowY)){const rect=parent.getBoundingClientRect();top=Math.max(top,rect.top);bottom=Math.min(bottom,rect.bottom)}}
  return {height:row.height,visible:Math.max(0,bottom-top)}
 })
 expect(visible.visible).toBeGreaterThanOrEqual(visible.height-2)
 await page.screenshot({path:test.info().outputPath('large-text-catalog-after.png')})
 const footer=page.locator('.garden-build-footer');await footer.scrollIntoViewIfNeeded()
 for(const button of await footer.getByRole('button').all()){
  expect(await button.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true)
 }
 await expect(page.getByRole('button',{name:'Reset Garden view',exact:true})).toBeInViewport()
 await page.screenshot({path:test.info().outputPath('large-text-footer-after.png')})
 const close=page.getByRole('button',{name:'Close Garden inventory',exact:true});await close.scrollIntoViewIfNeeded();await close.click()
 await expect(page.getByRole('dialog')).not.toBeVisible()
})
test('two tabs unlock unique geodes from the current low balance',async({page,context})=>{
 await wiringFixture(page);await page.goto('/')
 await page.evaluate(owner=>localStorage.setItem(`pebble:full-ui:community:v1:${owner}`,JSON.stringify({balance:600,owned:[],earnedChapters:[]})),user)
 await page.reload()
 const second=await context.newPage();await wiringFixture(second);await second.goto('/')
 await expect(second.getByRole('button',{name:'Build with 600 Pebbles',exact:true})).toBeEnabled()
 for(const tab of [page,second]){
  await tab.getByRole('button',{name:'Open Garden inventory',exact:true}).click()
  await tab.getByLabel('Random Pebbles',{exact:true}).click()
  await tab.getByRole('button',{name:'Open',exact:true}).click()
  await tab.getByRole('button',{name:'Keep in inventory',exact:true}).click()
 }
 const saved=await page.evaluate(owner=>JSON.parse(localStorage.getItem(`pebble:full-ui:community:v1:${owner}`)!),user)
 expect(saved.balance).toBe(0);expect(new Set(saved.geodeUnlocks).size).toBe(2)
 await expect(page.getByRole('button',{name:'Open',exact:true})).toBeDisabled()
 await expect(second.getByRole('button',{name:'Open',exact:true})).toBeDisabled()
 await second.screenshot({path:test.info().outputPath('geodes-after.png')})
})
for(const scenario of [{name:'insufficient balance',balance:0,owned:[]},{name:'duplicate ownership',balance:985,owned:['bench']}])test(`a rejected stale purchase (${scenario.name}) does not announce success, select an item or add undo`,async({page})=>{
 await wiringFixture(page);await page.goto('/')
 await page.evaluate(owner=>localStorage.setItem(`pebble:full-ui:community:v1:${owner}`,JSON.stringify({balance:1000,owned:[],earnedChapters:[]})),user)
 await page.reload()
 await page.getByRole('button',{name:'Open Garden inventory',exact:true}).click()
 await page.getByLabel('Decorations',{exact:true}).click()
 // Same-document write deliberately leaves React stale, as with an undelivered storage event.
 await page.evaluate(({owner,scenario})=>{
  localStorage.setItem(`pebble:full-ui:community:v1:${owner}`,JSON.stringify({balance:scenario.balance,owned:scenario.owned,earnedChapters:[]}))
  const row=[...document.querySelectorAll('.garden-shop-item')].find(row=>row.querySelector('strong')?.textContent==='Garden Bench')!
  row.querySelector('button')!.click()
 },{owner:user,scenario})
 await expect(page.locator('.garden-sr-only')).toHaveText('Garden Bench was not added. Your balance or inventory changed; check the updated garden.')
 await expect(page.getByRole('dialog',{name:'Your garden',exact:true})).toBeVisible()
 await expect(page.getByRole('group',{name:'Selected Garden item',exact:true})).toHaveCount(0)
 await expect(page.getByRole('button',{name:'Undo Garden change',exact:true})).toBeDisabled()
 expect(await page.evaluate(owner=>JSON.parse(localStorage.getItem(`pebble:full-ui:community:v1:${owner}`)!),user)).toMatchObject({balance:scenario.balance,owned:scenario.owned})
})
test('stale Undo cannot erase an external purchase before its storage event arrives',async({page})=>{
 await wiringFixture(page);await page.goto('/')
 await page.evaluate(owner=>localStorage.setItem(`pebble:full-ui:community:v1:${owner}`,JSON.stringify({balance:1000,owned:[],earnedChapters:[]})),user)
 await page.reload()
 await page.getByRole('button',{name:'Open Garden inventory',exact:true}).click();await page.getByLabel('Decorations',{exact:true}).click()
 await page.locator('.garden-shop-item').filter({has:page.getByText('Garden Bench',{exact:true})}).getByRole('button',{name:'Build',exact:true}).click()
 await page.getByRole('button',{name:'Open Garden inventory',exact:true}).click()
 await expect(page.getByRole('button',{name:'Undo Garden change',exact:true})).toBeEnabled()
 await page.evaluate(owner=>{
  localStorage.setItem(`pebble:full-ui:community:v1:${owner}`,JSON.stringify({balance:905,owned:['bench','river'],earnedChapters:[],purchaseCosts:{bench:15,river:80}}))
  document.querySelector<HTMLButtonElement>('[aria-label="Undo Garden change"]')!.click()
 },user)
 await expect(page.locator('.garden-sr-only')).toHaveText('Garden changed. Nothing was undone.')
 expect(await page.evaluate(owner=>JSON.parse(localStorage.getItem(`pebble:full-ui:community:v1:${owner}`)!),user)).toMatchObject({balance:905,owned:['bench','river']})
 await expect(page.getByRole('button',{name:'Undo Garden change',exact:true})).toBeDisabled()
})
test('repeated quick two-tab purchases retain both purchases (50 exclusive-lock pairs)',async({page,context})=>{
 await wiringFixture(page);await page.goto('/')
 const second=await context.newPage();await wiringFixture(second);await second.goto('/')
 for(const tab of [page,second])await expect(tab.getByRole('button',{name:'Open Garden inventory',exact:true})).toBeEnabled()
 const failures:unknown[]=[]
 for(let attempt=0;attempt<50;attempt++){
  await page.evaluate(owner=>localStorage.setItem(`pebble:full-ui:community:v1:${owner}`,JSON.stringify({balance:1000,owned:[],earnedChapters:[]})),user)
  const results=await Promise.all([page,second].map((tab,index)=>tab.evaluate(async({owner,index})=>{
   const path='/src/features/garden/state.ts'
   const {updateGarden}=await import(path)
   return await updateGarden(owner,{type:'build',id:index===0?'bench':'lanterns'})
  },{owner:user,index})))
  // Chromium can deliver another renderer's storage visibility after its lock result.
  // Retry reads only: neither mutation is retried or sequenced by this assertion.
  await expect.poll(()=>Promise.all([page,second].map(tab=>tab.evaluate(owner=>{
   const saved=JSON.parse(localStorage.getItem(`pebble:full-ui:community:v1:${owner}`)!)
   return {balance:saved.balance,owned:saved.owned.sort()}
  },user)))).toEqual([{balance:965,owned:['bench','lanterns']},{balance:965,owned:['bench','lanterns']}])
  const saved=await page.evaluate(owner=>JSON.parse(localStorage.getItem(`pebble:full-ui:community:v1:${owner}`)!),user)
  if(saved.balance!==965||!saved.owned.includes('bench')||!saved.owned.includes('lanterns'))failures.push({attempt,saved,results})
  expect(results.some(result=>result.after.community.balance===965&&result.after.community.owned.length===2)).toBe(true)
 }
 await test.info().attach('quick-purchase-results',{body:JSON.stringify({attempts:50,failures},null,2),contentType:'application/json'})
 expect(failures).toEqual([])
})
test('simultaneous geodes and low-balance duplicate purchases use the locked balance',async({page,context})=>{
 await wiringFixture(page);await page.goto('/')
 const second=await context.newPage();await wiringFixture(second);await second.goto('/')
 for(const tab of [page,second])await expect(tab.getByRole('button',{name:'Open Garden inventory',exact:true})).toBeEnabled()
 for(const [balance,kind] of [[600,'open-geode'],[300,'open-geode'],[15,'build']] as const){
  for(let attempt=0;attempt<10;attempt++){
   await page.evaluate(({owner,balance})=>localStorage.setItem(`pebble:full-ui:community:v1:${owner}`,JSON.stringify({balance,owned:[],earnedChapters:[]})),{owner:user,balance})
   await Promise.all([page,second].map(tab=>tab.evaluate(async({owner,kind})=>{
    const path='/src/features/garden/state.ts';const {updateGarden}=await import(path)
    await updateGarden(owner,kind==='build'?{type:'build',id:'bench'}:{type:'open-geode',random:0})
   },{owner:user,kind})))
   const saved=await page.evaluate(owner=>JSON.parse(localStorage.getItem(`pebble:full-ui:community:v1:${owner}`)!),user)
   expect(saved.balance).toBe(0)
   if(kind==='build')expect(saved.owned).toEqual(['bench'])
   else{expect(saved.geodeUnlocks).toHaveLength(balance/300);expect(new Set(saved.geodeUnlocks).size).toBe(balance/300)}
  }
 }
})
test('an account switch while waiting for a real cross-tab lock cancels the queued write',async({page,context})=>{
 await wiringFixture(page);await page.goto('/')
 await page.evaluate(owner=>localStorage.setItem(`pebble:full-ui:community:v1:${owner}`,JSON.stringify({balance:1000,owned:[],earnedChapters:[]})),user)
 const second=await context.newPage();await wiringFixture(second);await second.goto('/')
 for(const tab of [page,second])await expect(tab.getByRole('button',{name:'Open Garden inventory',exact:true})).toBeEnabled()
 await page.evaluate(async owner=>{
  await new Promise<void>(granted=>{
   void navigator.locks.request(`pebble:full-ui:community:v1:${owner}`,()=>new Promise<void>(release=>{
    Object.assign(window,{releaseGardenLock:release});granted()
   }))
  })
 },user)
 await second.evaluate(async owner=>{
  const path='/src/features/garden/state.ts';const {updateGarden}=await import(path)
  Object.assign(window,{pendingGardenWrite:updateGarden(owner,{type:'build',id:'bench'})})
 },user)
 await expect.poll(()=>page.evaluate(async()=> (await navigator.locks.query()).pending?.length)).toBe(1)
 await second.evaluate(async owner=>{
  const path='/src/features/garden/state.ts';const {retainGardenFor}=await import(path)
  retainGardenFor('other');retainGardenFor(null);retainGardenFor(owner)
 },user)
 await page.evaluate(()=>{(window as unknown as {releaseGardenLock:()=>void}).releaseGardenLock()})
 const result=await second.evaluate(async()=>await (window as unknown as {pendingGardenWrite:Promise<{cancelled:boolean}>}).pendingGardenWrite)
 expect(result.cancelled).toBe(true)
 expect(await page.evaluate(owner=>JSON.parse(localStorage.getItem(`pebble:full-ui:community:v1:${owner}`)!),user)).toMatchObject({balance:1000,owned:[]})
})
test('Undo queued behind another tab rechecks its expected snapshot inside the lock',async({page,context})=>{
 await wiringFixture(page);await page.goto('/')
 await page.evaluate(owner=>localStorage.setItem(`pebble:full-ui:community:v1:${owner}`,JSON.stringify({balance:1000,owned:[],earnedChapters:[]})),user)
 const second=await context.newPage();await wiringFixture(second);await second.goto('/')
 await second.getByRole('button',{name:'Open Garden inventory',exact:true}).click();await second.getByLabel('Decorations',{exact:true}).click()
 await second.locator('.garden-shop-item').filter({has:second.getByText('Garden Bench',{exact:true})}).getByRole('button',{name:'Build',exact:true}).click()
 await second.getByRole('button',{name:'Open Garden inventory',exact:true}).click()
 await page.evaluate(async owner=>{
  await new Promise<void>(granted=>{
   void navigator.locks.request(`pebble:full-ui:community:v1:${owner}`,()=>new Promise<void>(release=>{Object.assign(window,{releaseGardenLock:release});granted()}))
  })
 },user)
 await second.getByRole('button',{name:'Undo Garden change',exact:true}).click()
 await expect.poll(()=>page.evaluate(async()=> (await navigator.locks.query()).pending?.length)).toBe(1)
 await page.evaluate(owner=>{
  localStorage.setItem(`pebble:full-ui:community:v1:${owner}`,JSON.stringify({balance:905,owned:['bench','river'],earnedChapters:[],purchaseCosts:{bench:15,river:80}}))
  ;(window as unknown as {releaseGardenLock:()=>void}).releaseGardenLock()
 },user)
 await expect(second.locator('.garden-sr-only')).toHaveText('Garden changed. Nothing was undone.')
 expect(await second.evaluate(owner=>JSON.parse(localStorage.getItem(`pebble:full-ui:community:v1:${owner}`)!),user)).toMatchObject({balance:905,owned:['bench','river']})
})
test('rapid keyboard nudges reduce from the latest locked position',async({page})=>{
 await wiringFixture(page);await page.goto('/')
 await page.getByRole('button',{name:'Open Garden inventory',exact:true}).click()
 await page.getByText('Arrange with keyboard',{exact:true}).click()
 await page.getByRole('button',{name:'Move pebble',exact:true}).click()
 await page.locator('.garden-canvas').evaluate(canvas=>{
  for(let index=0;index<5;index++)for(const key of ['ArrowRight','ArrowDown'])canvas.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true}))
 })
 await expect.poll(()=>page.evaluate(owner=>JSON.parse(localStorage.getItem(`pebble:full-ui:community:v1:${owner}`)!).positions?.pebble,user)).toEqual({x:780,y:672})
})
test('a burst of drag placements serializes without erasing a concurrent purchase',async({page,context})=>{
 await wiringFixture(page);await page.goto('/')
 await page.evaluate(owner=>localStorage.setItem(`pebble:full-ui:community:v1:${owner}`,JSON.stringify({balance:1000,owned:[],earnedChapters:[]})),user)
 const second=await context.newPage();await wiringFixture(second);await second.goto('/')
 for(const tab of [page,second])await expect(tab.getByRole('button',{name:'Open Garden inventory',exact:true})).toBeEnabled()
 await Promise.all([
  page.evaluate(async owner=>{
   const path='/src/features/garden/state.ts';const {updateGarden}=await import(path)
   await Promise.all(Array.from({length:10},(_,index)=>updateGarden(owner,{type:'move-community-item',id:'pebble',position:{x:720+index*12,y:624}})))
  },user),
  second.evaluate(async owner=>{
   const path='/src/features/garden/state.ts';const {updateGarden}=await import(path)
   await updateGarden(owner,{type:'build',id:'bench'})
  },user),
 ])
 for(const tab of [page,second])await expect.poll(()=>tab.evaluate(owner=>JSON.parse(localStorage.getItem(`pebble:full-ui:community:v1:${owner}`)!),user)).toMatchObject({balance:985,owned:['bench'],positions:{pebble:{x:828,y:624}}})
})
for(const failure of ['unsupported locking','rejected locking','denied storage'])test(`safe memory-only fallback reports no save with ${failure}`,async({page})=>{
 await wiringFixture(page);await page.goto('/')
 await page.evaluate(owner=>localStorage.setItem(`pebble:full-ui:community:v1:${owner}`,JSON.stringify({balance:1000,owned:[],earnedChapters:[]})),user)
 await page.reload()
 await page.getByRole('button',{name:'Open Garden inventory',exact:true}).click();await page.getByLabel('Decorations',{exact:true}).click()
 await page.evaluate(failure=>{
  if(failure==='denied storage')Storage.prototype.setItem=()=>{throw new DOMException('Denied','SecurityError')}
  else Object.defineProperty(navigator,'locks',{configurable:true,value:failure==='unsupported locking'?undefined:{request:()=>Promise.reject(new DOMException('Denied','SecurityError'))}})
 },failure)
 await page.locator('.garden-shop-item').filter({has:page.getByText('Garden Bench',{exact:true})}).getByRole('button',{name:'Build',exact:true}).click()
 await expect(page.locator('.garden-sr-only')).toContainText('Not saved; changes last only in this tab.')
 await expect(page.getByRole('alert')).toHaveText("Changes aren't saved. They last only in this tab because local storage or safe locking is unavailable.")
 await expect(page.getByRole('alert')).toBeInViewport()
 await page.screenshot({path:test.info().outputPath(`memory-only-${failure.replaceAll(' ','-')}.png`)})
 expect(await page.evaluate(owner=>JSON.parse(localStorage.getItem(`pebble:full-ui:community:v1:${owner}`)!),user)).toMatchObject({balance:1000,owned:[]})
 await page.getByRole('button',{name:'Open Garden inventory',exact:true}).click()
 await expect(page.locator('.garden-build-footer small')).toContainText('Not saved')
 await expect(page.locator('.garden-build-footer small')).not.toContainText('Saved on this device')
})
