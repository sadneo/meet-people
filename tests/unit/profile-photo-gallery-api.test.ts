// @vitest-environment node
import { expect, it, vi } from 'vitest'
import express from 'express'
import type { AddressInfo } from 'node:net'
import sharp from 'sharp'
import { createProfilePhotoRouter } from '../../api/profile-photo'
import type { ProfileGalleryEdit } from '../../shared/profile-photo'

it('sanitizes appended files, confirms revisions, and serves only the requested authorized slot', async () => {
  const owner = 'a0000000-0000-4000-8000-000000000001'
  const peer = 'a0000000-0000-4000-8000-000000000002'
  let state = { revision: 1, count: 1 }
  let jpeg = ''
  const actor = {
    editPhotoGallery: vi.fn((edit: ProfileGalleryEdit) => {
      state = { revision: state.revision+1, count: state.count+(edit.action === 'append' ? 1 : 0) }
      if (edit.action === 'append') jpeg = edit.jpegBase64
      return { data: state, error: null }
    }),
    profilePhotoGallery: vi.fn(() => ({ data: state, error: null })),
    profilePhotoState: vi.fn(),
    saveProfilePhoto: vi.fn(() => ({ data: null, error: { code: '23514', message: 'violates check constraint "profile_photo_gallery_size"' } })),
    readPhotoSlot: vi.fn((id: string, revision: number) => id === owner
      ? { data: { revision, jpegBase64: jpeg }, error: null }
      : { data: null, error: { code: 'PT404' } }),
  }
  const app = express()
  app.use(express.json())
  app.use((req,res,next) => {
    if (req.headers.authorization === 'Bearer test-viewer') { res.locals.actor = actor; res.locals.actorId = owner }
    next()
  })
  app.use('/photos', createProfilePhotoRouter())
  const server = app.listen(0, '127.0.0.1')
  try {
    await new Promise<void>((resolve, reject) => server.once('listening', resolve).once('error', reject))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/photos`
    const send = (path: string, init: RequestInit = {}) => fetch(base+path, {
      ...init, headers: { Authorization:'Bearer test-viewer', ...init.headers },
    })
    const input = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#dcc7ac' } })
      .withExifMerge({ IFD0: { Artist: 'private-camera-owner' } }).jpeg().toBuffer()
    const appended = await send(`/gallery?expectedRevision=1&requestId=${crypto.randomUUID()}`, {
      method:'PUT', headers:{'Content-Type':'image/jpeg'}, body: new Uint8Array(input),
    })
    expect(appended.status).toBe(200)
    expect(await appended.json()).toEqual({ revision: 2, count: 2 })
    const legacyRemove = await send(`?expectedRevision=2&requestId=${crypto.randomUUID()}`, { method: 'DELETE' })
    expect(legacyRemove.status).toBe(409)
    expect(await legacyRemove.json()).toEqual({ error: 'Update Pebble to remove a photo from a gallery with multiple photos.' })
    expect(actor.profilePhotoState).not.toHaveBeenCalled()
    expect((await sharp(Buffer.from(jpeg,'base64')).metadata()).exif).toBeUndefined()
    const edit = { action:'move', position:2, toPosition:1, expectedRevision:2, requestId:crypto.randomUUID() }
    const moved = await send('/gallery',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(edit)})
    expect(await moved.json()).toEqual({ revision:3, count:2 })
    expect(actor.editPhotoGallery).toHaveBeenLastCalledWith(edit)
    expect((await send(`/gallery/${owner}/3/5`)).status).toBe(400)
    expect(actor.readPhotoSlot).not.toHaveBeenCalled()
    const photo = await send(`/gallery/${owner}/3/2`)
    expect(photo.headers.get('content-type')).toBe('image/jpeg')
    expect(photo.headers.get('cache-control')).toBe('no-store')
    expect((await sharp(Buffer.from(await photo.arrayBuffer())).metadata()).format).toBe('jpeg')
    expect(actor.readPhotoSlot).toHaveBeenLastCalledWith(owner,3,2)
    expect((await send(`/gallery/${peer}/3/2`)).status).toBe(404)
    expect((await fetch(base+`/gallery/${owner}`)).status).toBe(401)
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
