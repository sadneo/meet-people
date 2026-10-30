import { describe,expect,it } from 'vitest'
import { demoPlan,developmentDemoPlan,onboardingChapters,seedIdentity } from '../../scripts/demo-seed/plan'
import { developmentSetup } from '../../scripts/demo-seed/development'
import { queueSelection,queueSql } from '../../scripts/demo-seed/queue'
import { seedSql } from '../../scripts/demo-seed/sql'
import { scenarioPlan,scenarioSql,scenarioMarker } from '../../scripts/demo-seed/scenarios'
import { completedAccountChapters,SaveAccountSchema } from '../../shared/account'
import { reciprocalDatingTargets } from '../../shared/dating'
import { globalInterestChoices } from '../../src/features/account/global-interests'
describe('local demo population',()=>{
 it('limits queue actions to selected marked identities, with separate join and leave',()=>{
  expect(queueSelection(1)).toEqual([seedIdentity(1)])
  expect(queueSelection(2,3)).toEqual([seedIdentity(3),seedIdentity(4)])
  for(const args of [[0,1],[101,1],[2,100],[1,0],[1.5,1]])expect(()=>queueSelection(...args as [number,number])).toThrow()
  expect(queueSql()).toContain('raw_app_meta_data')
  expect(queueSql()).toContain("public.join_queue('matchmaking')")
  expect(queueSql(1,1,true)).toContain('public.leave_queue()')
  expect(queueSql(1,1,true)).not.toContain('public.join_queue')
  expect(queueSql()).not.toMatch(/save_account|disable trigger|delete from|insert into/i)
 })
 it('provides50 distinct fictional, adult, fully valid profiles with varied facts and preferences',()=>{
  const profiles=demoPlan(50,2026)
  expect(new Set(profiles.map(p=>p.id)).size).toBe(50)
  expect(new Set(profiles.map(p=>p.email)).size).toBe(50)
  expect(new Set(profiles.map(p=>p.age)).size).toBeGreaterThan(10)
  expect(new Set(profiles.map(p=>JSON.stringify(p.account.profile!.interests))).size).toBeGreaterThan(5)
  expect(new Set(profiles.map(p=>p.account.profile!.bio)).size).toBeGreaterThan(3)
  expect(new Set(profiles.map(p=>JSON.stringify(p.account.profile!.availability))).size).toBeGreaterThan(5)
  expect(new Set(profiles.map(p=>p.dating.intent)).size).toBe(3)
  for(const p of profiles){
   expect(p.email.endsWith('@example.test')).toBe(true)
   expect(p.account.profile!.display_name).toMatch(/^Demo /)
   expect(p.account.profile!.bio).toContain('Fictional local demo profile')
   expect(p.age).toBeGreaterThanOrEqual(18)
   expect(p.account.profile!.interests.every(value=>globalInterestChoices.includes(value))).toBe(true)
   expect(SaveAccountSchema.safeParse(p.account).success).toBe(true)
   expect(completedAccountChapters(p.account)).toEqual([0,1,2,3])
   expect(p.account.settings.availability).toBe(false)
  }
 })
 it('executes a valid four-chapter progression without pretending empty data is complete',()=>{
  const chapters=onboardingChapters(demoPlan(2)[0].account)
  expect(chapters.map(chapter=>chapter.completed.length)).toEqual([1,2,3,4])
  for(const chapter of chapters)expect(completedAccountChapters(chapter)).toEqual(chapter.completed)
 })
 it('includes reciprocal compatible pairs across straight, gay, lesbian and clarified identities',()=>{
  const profiles=demoPlan(50)
  for(let i=0;i<profiles.length;i+=2){
   const a=profiles[i],b=profiles[i+1]
   expect(reciprocalDatingTargets(a.dating,b.dating)).toBe(true)
   expect(a.age>=b.filters.ageMin&&a.age<=b.filters.ageMax).toBe(true)
   expect(b.age>=a.filters.ageMin&&b.age<=a.filters.ageMax).toBe(true)
  }
  expect(profiles.some(p=>p.filters.ageMax<profiles.at(-1)!.age)).toBe(true)
 })
 it('has stable reserved identities and bounded population size',()=>{
  expect(seedIdentity(1).id).toBe(demoPlan(2)[0].id)
  expect(seedIdentity(1).email).toBe('pebble-demo-001@example.test')
  expect(seedIdentity(1).id).not.toBe(seedIdentity(2).id)
  expect(demoPlan(50,2026).map(p=>p.id)).toEqual(demoPlan(50,2027).map(p=>p.id))
  for(const count of [0,1,101,2.5,NaN])expect(()=>demoPlan(count)).toThrow()
  expect(()=>seedIdentity(0)).toThrow()
 })
 it('plans separate messaging, pending request, Friends, Dating and labeled event fixtures',()=>{
  const scenarios=scenarioPlan(12)
  expect(scenarios.users.map(user=>user.id)).toEqual(demoPlan(12).map(user=>user.id))
  expect(scenarios.conversation).toMatchObject({first:1,second:2})
  expect(scenarios.conversation.messages).toHaveLength(3)
  expect(new Set(scenarios.conversation.messages.map(message=>message.requestId)).size).toBe(3)
  expect(scenarios.pending).toEqual({from:3,to:1})
  expect(scenarios.friends).toEqual([5,6])
  expect(scenarios.events.every(event=>event.title.startsWith('[DEMO]')&&event.members.length>=2)).toBe(true)
  expect(new Set(scenarios.events.map(event=>event.id)).size).toBe(3)
  expect(scenarioPlan(6).events).toEqual(scenarios.events)
  for(const count of [0,2,5,101,6.5,NaN])expect(()=>scenarioPlan(count)).toThrow()
 })
 it('uses marked ownership, existing actor RPCs, stable retry keys and explicit event renewal',()=>{
  const sql=scenarioSql(6)
  expect(sql.indexOf('raw_app_meta_data')).toBeLessThan(sql.indexOf('insert into public.listings'))
  expect(sql).toContain(scenarioMarker)
  expect(sql).toContain('public.social_send(chat,')
  expect(sql).toContain(scenarioPlan(6).conversation.messages[0].requestId)
  expect(sql).toContain('public.join_event_group_queue(')
  expect(sql).toContain("public.join_queue('matchmaking')")
  expect(sql).toContain('on conflict(source,external_id) do nothing')
  expect(sql).toContain('if false then')
  expect(scenarioSql(6,true)).toContain('if true then')
  expect(sql).not.toMatch(/insert into public\.(messages|connections|conversations)|update auth\.users|delete from|disable trigger|complete_event_group_job|scoring_enabled/i)
 })
 it('centers a large pool and multiple conversations on the dedicated development account',()=>{
  const primary={id:'d7300000-0000-4000-8000-000000000001',email:'development@example.test',username:'development_user'}
  const profiles=developmentDemoPlan(),scenarios=scenarioPlan(profiles.length,primary)
  expect(profiles).toHaveLength(60)
  expect(profiles.every(profile=>profile.filters.ageMin===18&&profile.filters.ageMax===99)).toBe(true)
  expect(profiles.filter(profile=>profile.dating.gender==='Woman'&&profile.dating.sexuality==='Straight').length).toBeGreaterThanOrEqual(20)
  expect(scenarios.conversations).toHaveLength(6)
  expect(scenarios.conversations.every(chat=>chat.first===0&&chat.messages.at(-1)!.sender!==0)).toBe(true)
  expect(new Set(scenarios.conversations.flatMap(chat=>chat.messages.map(message=>message.requestId))).size).toBe(18)
  expect(scenarios.pendingRequests).toEqual([{from:7,to:0},{from:8,to:0},{from:0,to:9}])
  expect(scenarios.friends).toHaveLength(60)
  expect(scenarios.friends).not.toContain(0)
  expect(scenarios.events.every(event=>event.members[0]===0&&event.members.length===18)).toBe(true)
  expect(scenarioPlan(60,primary).conversations).toEqual(scenarios.conversations)
  expect(()=>scenarioPlan(6,primary)).toThrow()
  const sql=scenarioSql(60,false,primary)
  expect(sql).toContain('pebble_development')
  expect(sql).toContain(primary.id)
  expect(developmentSetup(primary)).toContain('wholly empty fictional development persona')
  expect(()=>developmentSetup({...primary,id:"');drop table profiles;--"})).toThrow()
 })
 it('uses canonical RPCs and transactional provider-hook suppression while retaining all other guards',()=>{
  const sql=seedSql(demoPlan(2),new Map())
  expect(sql).toContain('begin;')
  expect(sql).toContain('disable trigger trg_user_interests_embed')
  expect(sql.indexOf('enable trigger trg_user_interests_embed')).toBeLessThan(sql.lastIndexOf('commit;'))
  expect(sql).toContain('set local role authenticated')
  expect(sql).toContain('public.save_account(chapter)')
  expect(sql).toContain('raw_app_meta_data')
  expect(sql).toContain('pebble-local-demo-v1')
  expect(sql).not.toMatch(/session_replication_role|disable trigger all|insert into public\.profiles|update auth\.users/i)
  expect(sql).not.toContain('password')
  expect(sql).not.toContain('public.join_queue')
 })
})
