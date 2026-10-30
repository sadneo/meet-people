// @vitest-environment node
import { expect, it } from 'vitest'
import sharp from 'sharp'
import { demoPlan } from '../../scripts/demo-seed/plan'
import { demoInitialsPhoto, demoStockPortrait } from '../../scripts/demo-seed/photos'

it('keeps original demo initials deterministic and compatible with existing seeded photos', async () => {
  const person = demoPlan(2)[0]
  const first = await demoInitialsPhoto(person)
  expect(await demoInitialsPhoto(person)).toEqual(first)
  expect(await sharp(first).metadata()).toMatchObject({ format: 'jpeg', width: 256, height: 256, isProgressive: false })
})

it('sanitizes stock portraits to bounded baseline JPEG with an explicit demo label strip', async () => {
  const source = await sharp({ create: { width: 120, height: 180, channels: 3, background: '#fff' } }).jpeg().toBuffer()
  const result = await demoStockPortrait(source)
  const metadata = await sharp(result).metadata()
  expect(metadata).toMatchObject({ format: 'jpeg', width: 512, height: 512, isProgressive: false })
  expect(metadata.exif).toBeUndefined()
  expect(result.length).toBeLessThan(262144)
  const { data, info } = await sharp(result).raw().toBuffer({ resolveWithObject: true })
  expect(data[(490 * 512 + 10) * info.channels]).toBeLessThan(120)
  expect(data[(470 * 512 + 10) * info.channels]).toBeGreaterThan(200)
})

it('rejects oversized or non-JPEG sources rather than storing unchecked files', async () => {
  await expect(demoStockPortrait(Buffer.alloc(600001))).rejects.toThrow('bounded download size')
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#fff' } }).png().toBuffer()
  await expect(demoStockPortrait(png)).rejects.toThrow('Expected a downloaded JPEG')
})
