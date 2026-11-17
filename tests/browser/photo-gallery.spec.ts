import { expect, test, type Page } from '@playwright/test'
import { emptyDatingProfile } from '../../shared/dating'
import { locationId, peer, user, wiringFixture } from './wiring-fixture'

const photos = ['maya', 'alex', 'jordan', 'sam'].map(name => `public/pebble/${name}.jpg`)
const screenshotStyle = '.development-navigator{display:none!important}body:has(.development-navigator){--development-toolbar-height:0px!important}'

async function galleryFixture(page: Page, photoCount = 1) {
  await wiringFixture(page)
  let revision = 1
  const own = photos.slice(0, photoCount)
  const captions = new Map<string, string>()
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
      else captions.delete(own.splice(i, 1)[0])
      revision++
      return route.fulfill({json: state()})
    }
    if (tail === `/gallery/${user}`) return route.fulfill({json:state()})
    const captionState = () => ({ revision, captions: own.map(photo => captions.get(photo) ?? null) })
    if (tail === `/gallery/${user}/captions`) return route.fulfill({ json: captionState() })
    if (tail === '/gallery/caption' && req.method() === 'PUT') {
      const { expectedRevision, position, caption } = req.postDataJSON()
      expect(expectedRevision).toBe(revision)
      if (caption) captions.set(own[position - 1], caption)
      else captions.delete(own[position - 1])
      return route.fulfill({ json: captionState() })
    }
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

for (const width of [320, 390]) test(`inline Profile photos stay compact and can be reordered at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 840 })
  const own = await galleryFixture(page, 2)
  await page.goto('/profile')

  const gallery = page.getByRole('region', { name: 'Photos', exact: true })
  const tiles = gallery.getByRole('listitem')
  await expect(tiles).toHaveCount(2)
  const [first, second] = await Promise.all([tiles.nth(0).boundingBox(), tiles.nth(1).boundingBox()])
  expect(first!.y).toBe(second!.y)
  expect(Math.abs(first!.width - second!.width)).toBeLessThan(1)
  expect(first!.width).toBeLessThanOrEqual(104)
  expect(Math.abs(first!.width - first!.height)).toBeLessThan(1)
  await expect(tiles.nth(0).getByText('Main')).toBeVisible()
  await expect(gallery.getByRole('button', { name: /Reorder photo|Remove photo/ })).toHaveCount(0)
  await expect(gallery.getByRole('button', {name:'Add photo'})).toBeEnabled()
  await page.addStyleTag({ content: screenshotStyle })
  await gallery.evaluate(element => element.scrollIntoView({ block: 'start', behavior: 'instant' }))
  await gallery.getByRole('img', { name: 'Photo 2' }).evaluate(img => (img as HTMLImageElement).decode())
  await page.screenshot({ path: info.outputPath('inline-photos.png'), style: screenshotStyle, animations: 'disabled' })
  if (width === 390) {
    const from = (await gallery.getByRole('button', { name: 'Preview photo 2' }).boundingBox())!
    const cdp = await page.context().newCDPSession(page)
    try {
      const point = (box: typeof from) => ({ x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) })
      const initialScroll = await page.evaluate(() => window.scrollY)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(from)] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x:point(from).x, y:point(from).y-60 }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(initialScroll)
      await expect(gallery.locator('.drag-source')).toHaveCount(0)
      await expect(page.getByRole('dialog', { name: 'Photo 2' })).toHaveCount(0)
      expect(own[0]).toBe(photos[0])

      await gallery.evaluate(element => element.scrollIntoView({ block: 'start', behavior: 'instant' }))
      const start = (await gallery.getByRole('button', { name: 'Preview photo 2' }).boundingBox())!
      const destination = (await tiles.first().boundingBox())!
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(start)] })
      await expect(gallery.locator('.drag-source')).toHaveCount(1)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(destination)] })
      await expect(gallery.locator('.drop-target')).toHaveAttribute('data-gallery-position', '1')
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await expect(gallery.getByText('Photo moved to position 1.')).toBeAttached()
      expect(own[0]).toBe(photos[1])

      const nextThumbnail = gallery.getByRole('button', { name: 'Preview photo 2' })
      await expect(nextThumbnail).toBeVisible()
      const tap = point((await nextThumbnail.boundingBox())!)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tap] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await expect(page.getByRole('dialog', { name: 'Photo 2', exact: true })).toBeVisible()
    } finally {
      await cdp.detach()
    }
  }
})

for (const location of ['inline','manager']) test(`previews a photo and makes it primary from the ${location} gallery`, async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const own = await galleryFixture(page, 2)
  await page.goto(location === 'inline' ? '/profile' : '/profile?section=basics')
  if (location === 'manager') {
    const open = page.getByRole('button', { name: 'Manage photos' })
    await expect(open).toBeEnabled()
    await open.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
    await open.click()
  }

  const gallery = location === 'manager'
    ? page.getByRole('dialog', { name: 'Profile photos' })
    : page.getByRole('region', { name: 'Photos', exact: true })
  const thumbnail = gallery.getByRole('button', { name: 'Preview photo 2' })
  const preview = page.getByRole('dialog', { name: 'Photo 2', exact: true })
  await thumbnail.click()
  await expect(preview.getByRole('img', { name: 'Photo 2' })).toHaveCSS('object-fit', 'contain')
  await page.keyboard.press('Escape')
  await expect(preview).toHaveCount(0)
  await expect(thumbnail).toBeFocused()
  expect(own[0]).toBe(photos[0])

  await thumbnail.click()
  const image = preview.getByRole('img', { name: 'Photo 2' })
  await image.evaluate(img => (img as HTMLImageElement).decode())
  await page.screenshot({ path: info.outputPath('photo-preview.png'), style: screenshotStyle, animations: 'disabled' })
  const primary = preview.getByRole('button', { name: 'Make profile photo' })
  const caption = preview.getByRole('textbox', { name: /Caption/ })
  await expect(caption).toBeEnabled()
  await expect(preview.getByRole('button', { name: 'Close' })).toBeFocused()
  // Focus wraps to the last control: the optional caption field.
  await page.keyboard.press('Shift+Tab')
  await expect(caption).toBeFocused()
  await caption.fill('An afternoon by the water')
  await caption.press('Enter')
  await expect(page.getByText('Caption saved', { exact: true })).toBeVisible()
  const cover = page.waitForResponse(response => response.url().endsWith(`/profile-photo/${user}/2`))
  await primary.click()
  await cover
  await expect(preview).toHaveCount(0)
  await expect(gallery.getByText('Photo moved to position 1.')).toBeAttached()
  expect(own).toEqual([photos[1], photos[0]])

  await gallery.getByRole('button', { name: 'Preview photo 1' }).click()
  const mainPreview = page.getByRole('dialog', { name: 'Profile photo', exact: true })
  await expect(mainPreview.getByRole('textbox', { name: /Caption/ })).toHaveValue('An afternoon by the water')
  await expect(page.getByRole('button', { name: 'Make profile photo' })).toHaveCount(0)
})

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
  const handle = dialog.getByRole('button',{name:'Preview photo 4'})
  await handle.scrollIntoViewIfNeeded()
  const start = (await handle.boundingBox())!
  const target = (await dialog.getByRole('img',{name:'Photo 1',exact:true}).boundingBox())!
  const cdp = await page.context().newCDPSession(page)
  const from = { x:start.x+start.width/2, y:start.y+start.height/2 }
  const to = { x:target.x+target.width/2, y:target.y+target.height/2 }
  await cdp.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{x:Math.round(from.x),y:Math.round(from.y)}]})
  await expect(dialog.locator('.drag-source')).toHaveCount(1)
  for (let i=1;i<=8;i++) await cdp.send('Input.dispatchTouchEvent', {type:'touchMove',
    touchPoints:[{x:Math.round(from.x+(to.x-from.x)*i/8),y:Math.round(from.y+(to.y-from.y)*i/8)}]})
  await expect(dialog.locator('.drop-target')).toHaveAttribute('data-gallery-position','1')
  await page.screenshot({path:info.outputPath('drag-photo.png'),animations:'disabled',style:screenshotStyle})
  await cdp.send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]})
  await cdp.detach()
  await newCover
  expect(own).toEqual([photos[3],...photos.slice(0,3)])
  await dialog.getByRole('button',{name:'Preview photo 1'}).click()
  const primaryPreview = page.getByRole('dialog', {name:'Profile photo',exact:true})
  await primaryPreview.getByRole('button',{name:'Remove photo',exact:true}).click()
  await expect(primaryPreview.getByText('Remove your current profile photo?')).toBeVisible()
  const nextCover = page.waitForResponse(response => response.url().endsWith(`/profile-photo/${user}/6`))
  await primaryPreview.getByRole('button',{name:'Confirm removal'}).click()
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
