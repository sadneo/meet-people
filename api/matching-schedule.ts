import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { MatchingScoringSettingsResponseSchema as Settings, SaveMatchingScoringSettingsSchema as Save } from '../shared/matching-scoring.js'
import type { UserContextTransport } from './matchmaking.js'
class Failure extends Error { constructor(readonly status:number,message:string){super(message)} }
type Actor=ReturnType<UserContextTransport['actor']>
async function read(call:()=>PromiseLike<{data:unknown;error:{code?:string}|null}>){
 const result=await call()
 if(result.error)throw new Failure(result.error.code==='DA409'?409:result.error.code==='22023'?400:503,'Schedule settings could not be confirmed. Reload before trying again.')
 const parsed=Settings.safeParse(result.data)
 if(!parsed.success)throw new Failure(502,'Schedule response could not be confirmed.')
 return parsed.data
}
export function createMatchingScheduleRouter(){
 const router=Router(),actor=(res:Response)=>res.locals.actor as Actor
 router.use((req,res,next)=>{
  res.set('Cache-Control','no-store')
  if(!res.locals.actor||!z.uuid().safeParse(res.locals.actorId).success)return next(new Failure(401,'Sign in to edit your schedule.'))
  if(Object.keys(req.query??{}).length)return next(new Failure(400,'Unexpected schedule fields.'))
  next()
 })
 router.get('/',async(req,res)=>{
  if(req.body!==undefined&&!z.object({}).strict().safeParse(req.body).success)throw new Failure(400,'Unexpected schedule fields.')
  const call=actor(res).matchingScoringSettings;if(!call)throw new Failure(503,'Schedule settings are unavailable.')
  res.json(await read(call))
 })
 router.put('/',async(req,res)=>{
  const value=Save.safeParse(req.body);if(!value.success)throw new Failure(400,'Choose a valid timezone and visibility.')
  const save=actor(res).saveMatchingScoringSettings,get=actor(res).matchingScoringSettings
  if(!save||!get)throw new Failure(503,'Schedule settings are unavailable.')
  const result=await read(()=>save(value.data))
  if(result.revision!==value.data.expectedRevision+1||result.timeZone!==value.data.timeZone||result.showAvailability!==value.data.showAvailability)throw new Failure(502,'Schedule save is unconfirmed. Reload before retrying.')
  try{const current=await read(get);if(JSON.stringify(current)!==JSON.stringify(result))throw new Error('Changed');res.json(current)}
  catch{throw new Failure(503,'Schedule may already be saved. Reload before trying again.')}
 })
 router.use((error:unknown,_req:Request,res:Response,next:NextFunction)=>{void next;const failure=error instanceof Failure?error:new Failure(503,'Schedule may already be saved. Reload before trying again.');res.status(failure.status).json({error:failure.message})})
 return router
}
