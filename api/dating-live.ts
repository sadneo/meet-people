import { Router,type Request,type Response,type NextFunction } from 'express'
import { z } from 'zod'
import { DatingRuntimeSchema,DatingEnableSchema,DatingCandidateRequestSchema,DatingCandidateResultSchema } from '../shared/dating-live.js'
import { sameDatingProfile,sameDatingSearch } from '../shared/dating.js'
import { ConnectionStateSchema } from '../shared/connections.js'
import type { UserContextTransport } from './matchmaking.js'
import { rankedDatingCandidate, rankedDatingBatch, type DatingScoringTransport } from './matching/dating-recommendations.js'
import { DatingBatchRequestSchema } from '../shared/dating-live.js'
import { DatingScoringSettingsResponseSchema, SaveDatingScoringSettingsSchema } from '../shared/dating-scoring.js'
class Failure extends Error{constructor(readonly status:number,message:string){super(message)}}
type Actor=ReturnType<UserContextTransport['actor']>
function unwrap(result:{data:unknown;error:{code?:string}|null}){
 if(result.error){const code=result.error.code
  if(['28000','PGRST301','PGRST302','PGRST303'].includes(code??''))throw new Failure(401,'Sign in again to use Dating.')
  if(code==='DA409')throw new Failure(409,'Dating preferences changed. Reload before trying again.')
  if(code==='DL409')throw new Failure(409,'Dating is unavailable for this selection. Check saved details, adult eligibility, discovery and current location.')
  if(code==='22023'||code==='23514')throw new Failure(400,'Check Dating fields and reload saved preferences.')
  if(code==='42501')throw new Failure(403,'This connection is unavailable.')
  throw new Failure(503,'Real Dating could not be confirmed. Reload before retrying.')
 }return result.data
}
function parse<T>(schema:z.ZodType<T>,value:unknown){const parsed=schema.safeParse(value);if(!parsed.success)throw new Failure(502,'Dating response could not be confirmed.');return parsed.data}
export function createDatingLiveRouter(scoring: DatingScoringTransport | null = null){
 const router=Router(),actor=(response:Response)=>response.locals.actor as Actor
 router.use((req,res,next)=>{res.set('Cache-Control','no-store');if(!res.locals.actor||!z.uuid().safeParse(res.locals.actorId).success)return next(new Failure(401,'Sign in to use Dating.'));if(Object.keys(req.query??{}).length)return next(new Failure(400,'Unexpected Dating request fields.'));next()})
 router.get('/status',async(req,res)=>{
  if(req.body!==undefined&&!z.object({}).strict().safeParse(req.body).success)throw new Failure(400,'Unexpected Dating request fields.')
  const call=actor(res).datingRuntime;if(!call)throw new Failure(503,'Real Dating is not available yet.');res.json(parse(DatingRuntimeSchema,unwrap(await call())))
 })
 router.put('/enabled',async(req,res)=>{
  const value=DatingEnableSchema.safeParse(req.body);if(!value.success)throw new Failure(400,'Use the current saved Dating revisions and explicit consent.')
  const call=actor(res).setDatingEnabled,read=actor(res).datingRuntime;if(!call||!read)throw new Failure(503,'Real Dating is not available yet.')
  const saved=parse(DatingRuntimeSchema,unwrap(await call(value.data))),d=saved.aggregate
  if(d.profile.enabled!==value.data.enabled||d.profileRevision!==value.data.expectedProfileRevision+1||d.searchRevision!==value.data.expectedSearchRevision+1)throw new Failure(502,'Dating participation could not be confirmed. Reload before retrying.')
  try{const current=parse(DatingRuntimeSchema,unwrap(await read())),c=current.aggregate;if(c.profileRevision!==d.profileRevision||c.searchRevision!==d.searchRevision||!sameDatingProfile(c.profile,d.profile)||!sameDatingSearch(c.search,d.search))throw new Error('Changed readback');res.json(current)}
  catch{throw new Failure(503,'Dating participation may already be saved. Reload before retrying.')}
 })
 router.post('/candidate',async(req,res)=>{
  const value=DatingCandidateRequestSchema.safeParse(req.body);if(!value.success)throw new Failure(400,'Use up to 50 distinct skipped profile IDs.')
  const call=actor(res).datingCandidate,project=actor(res).projectDatingCandidate
  if(scoring ? !project : !call)throw new Failure(503,'Real Dating is not available yet.')
  const result=scoring
   ? await rankedDatingCandidate(scoring,res.locals.actorId,value.data.excludedIds,project!)
   : parse(DatingCandidateResultSchema,unwrap(await call!(value.data.excludedIds)))
  if(result.candidate&&(result.candidate.id===res.locals.actorId||value.data.excludedIds.includes(result.candidate.id)))throw new Failure(502,'Dating candidate identity could not be confirmed.')
  res.json(result)
 })
 router.post('/recommendations',async(req,res)=>{
  const value=DatingBatchRequestSchema.safeParse(req.body)
  if(!value.success)throw new Failure(400,'Choose a batch size of 1–10 and up to 50 distinct skipped profiles.')
  const project=actor(res).projectDatingCandidate
  if(!scoring||!project)throw new Failure(503,'Dating recommendations are unavailable.')
  res.json(await rankedDatingBatch(scoring,res.locals.actorId,value.data.excludedIds,value.data.limit,project))
 })
 router.get('/scoring-settings',async(req,res)=>{
  if(req.body!==undefined&&!z.object({}).strict().safeParse(req.body).success)throw new Failure(400,'Unexpected Dating request fields.')
  const call=actor(res).datingScoringSettings;if(!call)throw new Failure(503,'Dating settings are not available yet.')
  res.json(parse(DatingScoringSettingsResponseSchema,unwrap(await call())))
 })
 router.put('/scoring-settings',async(req,res)=>{
  const value=SaveDatingScoringSettingsSchema.safeParse(req.body);if(!value.success)throw new Failure(400,'Choose a valid named timezone and availability visibility.')
  const call=actor(res).saveDatingScoringSettings,read=actor(res).datingScoringSettings;if(!call||!read)throw new Failure(503,'Dating settings are not available yet.')
  const saved=parse(DatingScoringSettingsResponseSchema,unwrap(await call(value.data)))
  if(saved.revision!==value.data.expectedRevision+1||saved.timeZone!==value.data.timeZone||saved.showAvailability!==value.data.showAvailability)throw new Failure(502,'Dating settings could not be confirmed. Reload before retrying.')
  try{
   const confirmed=parse(DatingScoringSettingsResponseSchema,unwrap(await read()))
   if(confirmed.revision!==saved.revision||confirmed.timeZone!==saved.timeZone||confirmed.showAvailability!==saved.showAvailability)throw new Error('Changed settings')
   res.json(confirmed)
  }catch{throw new Failure(503,'Dating settings may already be saved. Reload before retrying.')}
 })
 router.post('/requests/:target',async(req,res)=>{
  const target=z.uuid().safeParse(req.params.target)
  if(!target.success||target.data===res.locals.actorId||!z.object({}).strict().safeParse(req.body).success)throw new Failure(400,'Choose another real Dating profile without extra fields.')
  const call=actor(res).requestDatingConnection,read=actor(res).socialConnection;if(!call||!read)throw new Failure(503,'Dating requests are not available yet.')
  const saved=parse(ConnectionStateSchema,unwrap(await call(target.data)))
  if(!['sent','connected'].includes(saved.status))throw new Failure(502,'The connection request could not be confirmed.')
  try{const current=parse(ConnectionStateSchema,unwrap(await read(target.data,'get')));if(current.status!==saved.status||current.conversationId!==saved.conversationId)throw new Error('Changed readback');res.json(current)}
  catch{throw new Failure(503,'The request may already be saved. Check Connections before trying again.')}
 })
 router.use((error:unknown,_req:Request,res:Response,next:NextFunction)=>{void next;const failure=error instanceof Failure?error:new Failure(503,'Real Dating could not be confirmed. Reload before retrying.');res.status(failure.status).json({error:failure.message})})
 return router
}
