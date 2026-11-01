import { expect,it } from 'vitest'
import sharp from 'sharp'
import { sanitizeProfilePhoto } from '../../api/profile-photo'
it('decodes, orients, bounds dimensions and removes camera metadata from real bytes',async()=>{
 const input=await sharp({create:{width:800,height:400,channels:3,background:'#dfcbbd'}}).withMetadata({orientation:6}).withExifMerge({IFD0:{Artist:'private-camera-owner'}}).jpeg().toBuffer()
 expect((await sharp(input).metadata()).exif).toBeDefined()
 const result=await sanitizeProfilePhoto(input),metadata=await sharp(result).metadata()
 expect(metadata.format).toBe('jpeg');expect(metadata.width).toBe(256);expect(metadata.height).toBe(512)
 expect(metadata.exif).toBeUndefined();expect(metadata.icc).toBeUndefined();expect(metadata.xmp).toBeUndefined();expect(metadata.orientation).toBeUndefined();expect(result.length).toBeLessThanOrEqual(262144)
 expect(result.includes(Buffer.from('private-camera-owner'))).toBe(false)
})
it('rejects unsupported, malformed and oversized input without returning a photo',async()=>{
 for(const bytes of [Buffer.from('not a real image'),Buffer.alloc(5*1024*1024+1),Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')])await expect(sanitizeProfilePhoto(bytes)).rejects.toThrow()
})
it('serves normal avatar bursts through a bounded queue and still strips metadata',async()=>{
 const input=await sharp({create:{width:128,height:128,channels:3,background:'#dfcbbd'}}).withExifMerge({IFD0:{Artist:'private-camera-owner'}}).jpeg().toBuffer()
 const photos=await Promise.all(Array.from({length:12},()=>sanitizeProfilePhoto(input,true)))
 expect(photos).toHaveLength(12)
 for(const bytes of photos){expect((await sharp(bytes).metadata()).exif).toBeUndefined();expect(bytes.includes(Buffer.from('private-camera-owner'))).toBe(false)}
})
it('keeps avatar backpressure bounded instead of accepting unlimited queued images',async()=>{
 const input=await sharp({create:{width:128,height:128,channels:3,background:'#dfcbbd'}}).jpeg().toBuffer()
 const results=await Promise.allSettled(Array.from({length:35},()=>sanitizeProfilePhoto(input,true)))
 expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(34)
 expect(results.filter(result=>result.status==='rejected')).toHaveLength(1)
})
