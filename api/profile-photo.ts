import { Router, raw, type Request, type Response, type NextFunction } from 'express'
import sharp from 'sharp'
import { z } from 'zod'
import { ProfilePhotoStateSchema, ProfilePhotoWriteSchema } from '../shared/profile-photo.js'
import type { UserContextTransport } from './matchmaking.js'
class PhotoFailure extends Error{constructor(readonly status:number,message:string){super(message)}}
let processing=0,uploads=0
const admittedUploads=new WeakSet<Request>()
function releaseUpload(request:Request){if(admittedUploads.delete(request))uploads--}
export async function sanitizeProfilePhoto(input:Buffer){
 if(input.length<12||input.length>5*1024*1024)throw new PhotoFailure(400,'Choose a JPEG, PNG or WebP photo up to 5 MB.')
 const jpeg=input[0]===255&&input[1]===216&&input[2]===255,png=input.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),webp=input.toString('ascii',0,4)==='RIFF'&&input.toString('ascii',8,12)==='WEBP'
 if(!jpeg&&!png&&!webp)throw new PhotoFailure(400,'Choose a still JPEG, PNG or WebP photo.')
 if(processing>=2)throw new PhotoFailure(503,'Photo processing is busy. Try again shortly.')
 processing++
 try{
  const image=sharp(input,{limitInputPixels:16_000_000,failOn:'error',animated:false}).timeout({seconds:5})
  const metadata=await image.metadata()
  if(!['jpeg','png','webp'].includes(metadata.format??'')||(metadata.pages??1)!==1)throw new Error('Unsupported image')
  const bytes=await image.autoOrient().resize({width:512,height:512,fit:'inside',withoutEnlargement:true}).flatten({background:'#FAFBF7'}).toColourspace('srgb').jpeg({quality:80,progressive:false}).toBuffer()
  if(bytes.length>262144)throw new Error('Output too large')
  return bytes
 }catch(failure){if(failure instanceof PhotoFailure)throw failure;throw new PhotoFailure(400,'This photo could not be processed. Choose a still JPEG, PNG or WebP under 16 megapixels.')}
 finally{processing--}
}
type Actor=ReturnType<UserContextTransport['actor']>
function unwrap(result:{data:unknown;error:{code?:string}|null}){
 if(result.error){const code=result.error.code
  if(code==='28000')throw new PhotoFailure(401,'Sign in again to manage your photo.')
  if(code==='PH409')throw new PhotoFailure(409,'Your photo changed. Reload its current state before trying again.')
  if(code==='PH429')throw new PhotoFailure(429,'Photo change limit reached. Try again later.')
  if(code==='PT404'||code==='42501')throw new PhotoFailure(404,'Photo unavailable.')
  if(code==='22023'||code==='23514')throw new PhotoFailure(400,'The photo request was rejected. Reload before retrying.')
  throw new PhotoFailure(503,'Photo storage could not be confirmed. Reload before retrying.')
 }return result.data
}
export function createProfilePhotoRouter(){
 const router=Router(),actor=(res:Response)=>res.locals.actor as Actor
 router.use((_req,res,next)=>{res.set('Cache-Control','no-store');res.set('X-Content-Type-Options','nosniff');if(!res.locals.actor||!z.uuid().safeParse(res.locals.actorId).success)return next(new PhotoFailure(401,'Sign in to manage your photo.'));next()})
 router.get('/',async(req,res)=>{
  if(Object.keys(req.query??{}).length)throw new PhotoFailure(400,'Unexpected photo request fields.')
  const call=actor(res).profilePhotoState;if(!call)throw new PhotoFailure(503,'Photo storage is not available yet.')
  const parsed=ProfilePhotoStateSchema.safeParse(unwrap(await call()));if(!parsed.success)throw new PhotoFailure(502,'Photo state could not be confirmed.');res.json(parsed.data)
 })
 async function save(req:Request,res:Response,jpegBase64:string|null){
  const parsed=z.object({expectedRevision:z.string().regex(/^(0|[1-9][0-9]{0,15})$/).transform(Number).pipe(z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER-1)),requestId:z.uuid()}).strict().safeParse(req.query)
  if(!parsed.success)throw new PhotoFailure(400,'Reload the photo state and retry with a valid request.')
  const call=actor(res).saveProfilePhoto,read=actor(res).profilePhotoState
  if(!call||!read)throw new PhotoFailure(503,'Photo storage is not available yet.')
  const value=ProfilePhotoWriteSchema.parse({...parsed.data,jpegBase64})
  const written=ProfilePhotoStateSchema.safeParse(unwrap(await call(value)))
  if(!written.success||written.data.revision!==value.expectedRevision+1||written.data.hasPhoto!==(jpegBase64!==null))throw new PhotoFailure(502,'Photo save could not be confirmed. Reload before retrying.')
  try{
   const confirmed=ProfilePhotoStateSchema.parse(unwrap(await read()))
   if(confirmed.revision!==written.data.revision||confirmed.hasPhoto!==written.data.hasPhoto||confirmed.updatedAt!==written.data.updatedAt)throw new Error('Changed readback')
   res.json(confirmed)
  }catch{throw new PhotoFailure(503,'The photo may already be saved. Reload its current state before retrying.')}
 }
 router.put('/',(req,res,next)=>{
  if(uploads>=2)return next(new PhotoFailure(503,'Photo uploads are busy. Try again shortly.'))
  uploads++;admittedUploads.add(req)
  res.once?.('close',()=>releaseUpload(req))
  next()
 },raw({type:['image/jpeg','image/png','image/webp'],limit:'5mb'}),async(req,res)=>{
  try{
   if(!Buffer.isBuffer(req.body))throw new PhotoFailure(400,'Choose a JPEG, PNG or WebP photo.')
   await save(req,res,(await sanitizeProfilePhoto(req.body)).toString('base64'))
  }finally{releaseUpload(req)}
 })
 router.delete('/',async(req,res)=>{
  if(req.body!==undefined&&!z.object({}).strict().safeParse(req.body).success)throw new PhotoFailure(400,'Unexpected photo fields.')
  await save(req,res,null)
 })
 router.get('/reference/:owner',async(req,res)=>{
  const owner=z.uuid().safeParse(req.params.owner)
  if(!owner.success||Object.keys(req.query??{}).length)throw new PhotoFailure(400,'Invalid photo reference.')
  const call=actor(res).profilePhotoReference;if(!call)throw new PhotoFailure(503,'Photo storage is not available yet.')
  const parsed=ProfilePhotoStateSchema.safeParse(unwrap(await call(owner.data)));if(!parsed.success)throw new PhotoFailure(502,'Photo reference could not be confirmed.');res.json(parsed.data)
 })
 router.get('/:owner/:revision',async(req,res)=>{
  const owner=z.uuid().safeParse(req.params.owner),revision=z.string().regex(/^(0|[1-9][0-9]{0,15})$/).transform(Number).pipe(z.number().int().nonnegative().safe()).safeParse(req.params.revision)
  if(!owner.success||!revision.success||Object.keys(req.query??{}).length)throw new PhotoFailure(400,'Invalid photo reference.')
  const call=actor(res).readProfilePhoto;if(!call)throw new PhotoFailure(503,'Photo storage is not available yet.')
  const parsed=z.object({revision:z.number().int().positive().safe(),jpegBase64:z.string().max(360000)}).strict().safeParse(unwrap(await call(owner.data,revision.data)))
  if(!parsed.success||revision.data!==0&&parsed.data.revision!==revision.data)throw new PhotoFailure(502,'Photo response could not be confirmed.')
  const bytes=await sanitizeProfilePhoto(Buffer.from(parsed.data.jpegBase64,'base64'))
  res.type('image/jpeg').send(bytes)
 })
 router.use((error:unknown,_req:Request,res:Response,next:NextFunction)=>{void next;releaseUpload(_req);
  const failure=error instanceof PhotoFailure?error:typeof error==='object'&&error!==null&&'type'in error&&error.type==='entity.too.large'?new PhotoFailure(413,'Choose a photo up to 5 MB.'):new PhotoFailure(503,'Photo storage could not be confirmed. Reload before retrying.')
  res.status(failure.status).json({error:failure.message})
 })
 return router
}
