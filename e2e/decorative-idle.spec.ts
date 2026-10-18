import { expect, test, type Locator } from '@playwright/test'

async function holdFrames(container: Locator, selector: string, phase: number) {
  await container.evaluate(async (element, { selector, phase }) => {
    const animations = [...element.querySelectorAll(selector)].flatMap(frame => frame.getAnimations())
    animations.forEach(animation => animation.pause())
    await Promise.all(animations.map(animation => animation.ready))
    animations.forEach(animation => {
      const { duration, delay } = animation.effect!.getTiming()
      animation.currentTime = delay + Number(duration) * (1 + phase)
    })
  }, { selector, phase })
}

test('Home has three sharp held poses and hands refresh back to the thinking sprite', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const button = page.locator('.pt-pebble-refresh')
  const screenshots: string[] = []
  for (const [name, phase] of [['normal', 0], ['compressed', .25], ['stretched', .37]] as const) {
    await holdFrames(button, '.pt-home-idle-frame', phase)
    const visible = button.locator('.pt-home-idle-frame:visible')
    await expect(visible).toHaveCount(1)
    await expect(visible).toHaveAttribute('data-home-pose', name)
    await expect(visible).toHaveCSS('transform', 'none')
    await expect(visible.locator('image')).toHaveCSS('image-rendering', 'pixelated')
    screenshots.push((await button.screenshot({ path: `output/environment-idle/home-${name}.png` })).toString('base64'))
  }
  expect(new Set(screenshots).size).toBe(3)
  await page.screenshot({ path: 'output/environment-idle/home-desktop.png' })
  await button.click()
  await expect(button.locator('svg[data-expression="thinking"]')).toBeVisible()
  await expect(button.locator('.pt-home-idle-frame')).toHaveCount(0)
  await expect(button).toBeDisabled()
  await expect(button.locator('svg[data-expression="happy"]')).toBeVisible()
  await expect(button).toBeEnabled()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await button.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0)
  await expect(button.locator('.pt-home-idle-frame:visible')).toHaveAttribute('data-home-pose', 'normal')
})

test('breeze is limited to foliage patches with staggered, sharp states and reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/community')
  const world = page.locator('.pt-community-world')
  await expect(world.locator('[data-community-motion="tree"]')).toHaveCount(4)
  await expect(world.locator('[data-community-motion="grass"]')).toHaveCount(3)
  const timings = await world.locator('[data-community-motion="tree"] .pt-breeze-frame[data-breeze-pose="0"]').evaluateAll(frames => frames.map(frame => getComputedStyle(frame).animationDuration))
  expect(new Set(timings).size).toBe(4)
  // Freeze existing effects so screenshot differences can only come from breeze.
  await world.evaluate(async element => {
    const animations = element.getAnimations({ subtree: true })
    animations.forEach(animation => animation.pause())
    await Promise.all(animations.map(animation => animation.ready))
  })
  const screenshots: string[] = []
  for (const [name, phase] of [['rest', 0], ['right', .3], ['left', .7]] as const) {
    await holdFrames(world, '.pt-breeze-frame', phase)
    for (const patch of await world.locator('.pt-breeze').all()) {
      const visible = patch.locator('.pt-breeze-frame:visible')
      await expect(visible).toHaveCount(1)
      await expect(visible).toHaveCSS('image-rendering', 'pixelated')
      await expect(visible).toHaveCSS('transform', 'none')
    }
    screenshots.push((await world.screenshot({ path: `output/environment-idle/community-${name}.png` })).toString('base64'))
  }
  expect(new Set(screenshots).size).toBe(3)
  await page.screenshot({ path: 'output/environment-idle/community-desktop.png' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await world.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0)
  await expect(world.locator('.pt-breeze-frame[data-breeze-pose="0"]:visible')).toHaveCount(7)
  await expect(world.locator('.pt-breeze-frame:not([data-breeze-pose="0"]):visible')).toHaveCount(0)
  await page.getByRole('group', { name: 'Select a day' }).getByRole('button').first().click()
  await expect(world.locator('.pt-breeze')).toHaveCount(0)
})
