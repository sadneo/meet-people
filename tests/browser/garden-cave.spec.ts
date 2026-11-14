import { test, expect } from '@playwright/test'
import { wiringFixture } from './wiring-fixture'
import { gardenProjection } from '../../src/features/garden/sky'

test('purchase a cave, arrange three Pebbles, and keep their drops visible while saving', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 860 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const { garden } = await wiringFixture(page)
  garden.seed({ balance: 300, owned: ['garnet','sapphire'], earnedChapters: [] })
  await page.goto('/')
  await page.getByRole('button', { name: 'Open Garden inventory' }).click()
  await page.getByLabel('Buildings', {exact:true}).click()
  const cave = page.locator('.garden-shop-item').filter({has:page.getByText('Pebble Cave',{exact:true})})
  await expect(cave).toContainText('150 Pebbles')
  await cave.getByRole('button',{name:'Build'}).click()
  await expect(page.getByRole('group',{name:'Selected Garden item'})).toContainText('Pebble Cave')
  await expect(page.getByRole('button',{name:'Build with 150 Pebbles'})).toBeEnabled()

  const canvas = page.locator('.garden-canvas')
  const box = (await canvas.boundingBox())!
  const view = gardenProjection(box.width,box.height,{x:0,y:0,zoom:1})
  const pointer = (x:number,y:number) => page.mouse.move(box.x+view.x+x*view.scale,box.y+view.y+y*view.scale,{steps:6})
  const frame = () => canvas.evaluate(async element => {
    // Sample after the renderer's 32 ms paint interval.
    for(let i=0;i<5;i++) await new Promise(requestAnimationFrame)
    return (element as HTMLCanvasElement).toDataURL()
  })

  let pendingSave: Promise<void> = Promise.resolve()
  await page.route('**/api/garden', async route => {
    if(route.request().postDataJSON()?.action==='move') await pendingSave
    await route.fallback()
  })
  for (const [id, x, y, targetX] of [
    ['garnet',475,651,588], ['pebble',724,610,696], ['sapphire',793,777,804]
  ] as const) {
    let release!: () => void
    pendingSave = new Promise<void>(resolve => {release=resolve})
    try {
      await pointer(x,y-36)
      await page.mouse.down()
      await pointer(targetX,636-36)
      const dropped = await frame()
      const saving = page.waitForRequest(req => req.url().endsWith('/api/garden') && req.postDataJSON()?.action==='move')
      await page.mouse.up()
      await saving
      expect(await frame()).toBe(dropped)
    } finally { release() }
    await expect.poll(()=>garden.read().positions?.[id]).toEqual({x:targetX,y:636})
    await expect(page.getByText('Saving or loading your Garden…')).toHaveCount(0)
  }
  await page.reload()
  await expect(page.getByRole('button',{name:'Build with 150 Pebbles'})).toBeVisible()
  await expect(canvas).toBeVisible()
  await page.screenshot({path:info.outputPath('three-pebbles-in-cave.png')})
  // Pick a resident back up out of the entrance, rather than moving the cave.
  await pointer(588,600)
  await page.mouse.down()
  await pointer(480,696)
  await page.mouse.up()
  await expect.poll(()=>garden.read().positions?.garnet).toEqual({x:480,y:732})
  expect(garden.read().positions?.cave).toBeUndefined()
})
