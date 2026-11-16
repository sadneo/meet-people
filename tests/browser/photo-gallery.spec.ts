import { expect, test, type Page } from '@playwright/test'
import { emptyDatingProfile } from '../../shared/dating'
import { locationId, peer, user, wiringFixture } from './wiring-fixture'

const photos = ['maya', 'alex', 'jordan', 'sam'].map(name => `public/pebble/${name}.jpg`)
const screenshotStyle = '.development-navigator{display:none!important}body:has(.development-navigator){--development-toolbar-height:0px!important}'

async function galleryFixture(page: Page) {
  await wiringFixture(page)
  let revision = 1
  const own = [photos[0]]
  await page.route('**/api/matchmaking/profile-photo**', route => {
    const req = route.request()
    const url = new URL(req.url())
    const [, tail = ''] = url.pathname.split('/profile-photo')
    const state = () => ({revision, count: own.length})
    if (tail === '/gallery' && req.method() === 'PUT') {
      expect(Number(url.searchParams.get('expectedRevision'))).toBe(revision)
      own.push(photos[own.length])
      revision++
      return route.fulfill({json: state()})
    }
    if (tail === '/gallery' && req.method() === 'PATCH') {
      const { action, expectedRevision, position, toPosition } = req.postDataJSON()
      expect(expectedRevision).toBe(revision)
      const i = position - 1
      if (action === 'move') own.splice(toPosition - 1, 0, own.splice(i, 1)[0])
      else own.splice(i, 1)
      revision++
      return route.fulfill({json: state()})
    }
    if (tail === `/gallery/${user}`) return route.fulfill({json:state()})
    if (tail === `/gallery/${peer}`) return route.fulfill({json:{revision: 2, count: 2}})
    if (!tail) return route.fulfill({json:{revision, hasPhoto:own.length>0, updatedAt:'2026-11-16T12:00:00Z'}})
    const parts = tail.slice(1).split('/')
    if (parts[0] === 'gallery' && parts.length === 4) {
      if (parts[1] === user && Number(parts[2]) !== revision) return route.fulfill({status:404,json:{error:'Photo unavailable.'}})
      const file = (parts[1] === user ? own : photos)[Number(parts[3]) - 1]
      return route.fulfill({path:file,contentType:'image/jpeg'})
    }
    if (parts.length === 2 && parts[0] === user) return route.fulfill({path:own[0],contentType:'image/jpeg'})
    if (parts.length === 2 && parts[0] === peer) return route.fulfill({path:photos[0],contentType:'image/jpeg'})
    return route.fallback()
  })
  await page.route(/\/api\/matchmaking\/(friends|dating)\/recommendations$/, route => {
    const dating = route.request().url().includes('/dating/')
    return route.fulfill({json:{
      algorithmVersion: dating ? 'dating-rules-v1' : 'friends-rules-v1',
      candidates:[{id:peer,name:'Taylor',age:23,city:null,bio:null,avatar:null,photoRevision:2,interests:['Coffee'],areaDistanceMiles:1,
        ...(dating && {heightInches:null,gender:null,sexuality:null,intent:'Long-term relationship',style:'Monogamy'})}],
    }})
  })
  await page.route('**/api/matchmaking/dating/status', route => route.fulfill({json:{
    available: true, globalDiscovery: true, datingDiscovery: true, canStart: true,
    aggregate: {
      profileRevision:1, searchRevision:1,
      profile:{...emptyDatingProfile(),gender:'Man',sexuality:'Straight',intent:'Long-term relationship',style:'Monogamy',clarifiedTargets:['Woman'],enabled:true},
      search:{ageMin:18,ageMax:99,radiusMiles:15,searchArea:{source:'home',resolvedLocationRef:locationId}},
      eligibility:{asOf:'2026-10-30',adult:true,locationResolved:true},effectiveEnabled:true,
    },
  }}))
  return own
}

test('adds to four, moves the profile photo, and promotes the next photo after removal', async ({ page }, info) => {
  await page.setViewportSize({width:320,height:740})
  const own = await galleryFixture(page)
  await page.goto('/profile?section=basics')
  await page.getByRole('button',{name:'Manage photos'}).click()
  const dialog = page.getByRole('dialog',{name:'Profile photos'})
  await expect(dialog.getByText('1 of 4 photos')).toBeVisible()
  for (let i=1; i<4; i++) {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'),dialog.getByRole('button',{name:'Add photo'}).click()])
    await chooser.setFiles(photos[i])
    await expect(dialog.getByRole('img',{name:'New photo preview'})).toBeVisible()
    await dialog.getByRole('button',{name:'Upload photo'}).click()
    await expect(dialog.getByText(`${i+1} of 4 photos`)).toBeVisible()
  }
  await expect(dialog.getByRole('button',{name:'Add photo'})).toHaveCount(0)
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await expect(dialog.getByRole('img', {name:'Photo 4'})).toBeVisible()
  await page.screenshot({path:info.outputPath('manage-photos.png'),animations:'disabled',style:screenshotStyle})
  const newCover = page.waitForResponse(response => response.url().endsWith(`/profile-photo/${user}/5`))
  const handle = dialog.getByRole('button',{name:'Reorder photo 4'})
  await handle.scrollIntoViewIfNeeded()
  const start = (await handle.boundingBox())!
  const target = (await dialog.getByRole('img',{name:'Photo 1',exact:true}).boundingBox())!
  const cdp = await page.context().newCDPSession(page)
  const from = { x:start.x+start.width/2, y:start.y+start.height/2 }
  const to = { x:target.x+target.width/2, y:target.y+target.height/2 }
  await cdp.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{x:Math.round(from.x),y:Math.round(from.y)}]})
  for (let i=1;i<=8;i++) await cdp.send('Input.dispatchTouchEvent', {type:'touchMove',
    touchPoints:[{x:Math.round(from.x+(to.x-from.x)*i/8),y:Math.round(from.y+(to.y-from.y)*i/8)}]})
  await expect(dialog.locator('.drop-target')).toHaveAttribute('data-gallery-position','1')
  await page.screenshot({path:info.outputPath('drag-photo.png'),animations:'disabled',style:screenshotStyle})
  await cdp.send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]})
  await cdp.detach()
  await newCover
  expect(own).toEqual([photos[3],...photos.slice(0,3)])
  await dialog.getByRole('button',{name:'Remove photo 1'}).click()
  await expect(dialog.getByText('Remove your current profile photo?')).toBeVisible()
  const nextCover = page.waitForResponse(response => response.url().endsWith(`/profile-photo/${user}/6`))
  await dialog.getByRole('button',{name:'Remove photo',exact:true}).click()
  await expect(dialog.getByText('3 of 4 photos')).toBeVisible()
  await nextCover
  expect(own[0]).toBe(photos[0])
})

for (const mode of ['Friends','Dating']) test(`flips between photos in ${mode}`, async ({ page }, info) => {
  await page.setViewportSize({width:390,height:840})
  await galleryFixture(page)
  await page.goto(`/matchmaking?mode=${mode.toLowerCase()}`)
  const card = page.locator('.discovery-profile:visible')
  await expect(card.getByRole('img',{name:'Taylor',exact:true})).toBeVisible()
  const viewer = card.getByRole('group', {name:'Taylor’s photos'})
  await expect(viewer).toBeVisible()
  const bounds = (await viewer.boundingBox())!
  const y = Math.round(bounds.y + bounds.height * 0.45)
  const left = Math.round(bounds.x + bounds.width * 0.23)
  const right = Math.round(bounds.x + bounds.width * 0.77)
  const cdp = await page.context().newCDPSession(page)
  async function swipe(from: number, to: number, deltaY = 0) {
    await cdp.send('Input.dispatchTouchEvent', {type:'touchStart', touchPoints:[{x:from,y}]})
    for (let i=1;i<=5;i++) await cdp.send('Input.dispatchTouchEvent', {type:'touchMove',
      touchPoints:[{x:Math.round(from+(to-from)*i/5),y:Math.round(y+deltaY*i/5)}]})
    await cdp.send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]})
  }
  await swipe(right,right-5,24)
  await expect(card.getByRole('img',{name:'Taylor',exact:true})).toBeVisible()
  await expect(card.getByRole('button',{name:'Next photo'})).toHaveCount(0)
  await swipe(right,left)
  await expect(card.getByRole('img',{name:'Taylor, photo 2'})).toBeVisible()
  await expect(card.getByText('Photo 2 of 2',{exact:true})).toBeAttached()
  await card.getByRole('img',{name:'Taylor, photo 2'}).evaluate(img => (img as HTMLImageElement).decode())
  await page.screenshot({path:info.outputPath(`${mode.toLowerCase()}-photo-2.png`),animations:'disabled',style:screenshotStyle})
  await swipe(left,right)
  await cdp.detach()
  await expect(card.getByRole('img',{name:'Taylor',exact:true})).toBeVisible()
})
