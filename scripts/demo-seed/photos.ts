import sharp from 'sharp'
import type { DemoProfile } from './plan.js'

export async function demoInitialsPhoto(p: DemoProfile) {
  const initials = p.account.profile!.display_name.split(' ')[1].slice(0, 2).toUpperCase(), color = ['#dceacc', '#dfcbbd', '#d8e7e5', '#efd9d7', '#e5dfed'][p.index % 5]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="${color}"/><circle cx="128" cy="112" r="74" fill="#fafbf7"/><text x="128" y="130" text-anchor="middle" font-family="sans-serif" font-size="48" fill="#34583e">${initials}</text><text x="128" y="225" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#34583e">DEMO ${p.index}</text></svg>`
  return sharp(Buffer.from(svg)).jpeg({ quality: 80, progressive: false }).toBuffer()
}

export async function demoStockPortrait(input: Buffer) {
  if (input.length > 600_000) throw new Error('Source portrait exceeds the bounded download size')
  const image = sharp(input, { limitInputPixels: 16_000_000 })
  if ((await image.metadata()).format !== 'jpeg') throw new Error('Expected a downloaded JPEG stock portrait')
  const label = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect y="480" width="512" height="32" fill="#191715" fill-opacity="0.78"/><text x="256" y="501" text-anchor="middle" font-family="sans-serif" font-size="14" font-weight="600" fill="white">DEMO · STOCK PHOTO</text></svg>')
  return image.rotate().resize(512, 512, { fit: 'cover' }).composite([{ input: label }]).jpeg({ quality: 85, progressive: false }).toBuffer()
}
