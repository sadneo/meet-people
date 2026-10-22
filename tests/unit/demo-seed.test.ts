import { describe,expect,it } from 'vitest'
import { demoPlan,onboardingChapters,seedIdentity } from '../../scripts/demo-seed/plan'
import { queueSelection,queueSql } from '../../scripts/demo-seed/queue'
import { seedSql } from '../../scripts/demo-seed/sql'
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
