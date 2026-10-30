import { createHash } from 'node:crypto'
import { emptyAccount,SaveAccountSchema,type Account } from '../../shared/account.js'
import { emptyDatingProfile,DatingProfileSchema,type DatingProfile } from '../../shared/dating.js'
import { FriendsPreferencesSchema } from '../../shared/friends-search-preferences.js'
import { ProfileFactsSchema } from '../../shared/profile-details.js'
import { globalInterestChoices } from '../../src/features/account/global-interests.js'
export const seedMarker='pebble-local-demo-v1'
export const seedContainer='supabase_db_meet-people'
export const campusId='b641ad29-9f92-4e66-9490-0b616f8fd85c'
export const campusLabel='Stony Brook University'
export function seedIdentity(index:number){
 if(!Number.isInteger(index)||index<1||index>100)throw new Error('Demo index must be1–100')
 const bytes=createHash('sha256').update(`${seedMarker}:${index}`).digest().subarray(0,16);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128
 const hex=bytes.toString('hex'),suffix=String(index).padStart(3,'0')
 return{id:`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`,email:`pebble-demo-${suffix}@example.test`,username:`pebble_demo_${suffix}`}
}
const names=['Alex','Morgan','Jordan','Taylor','Casey','Riley','Sam','Jamie','Avery','Quinn','Cameron','Drew','Robin','Skyler','Parker','Reese','Rowan','Sage','Charlie','Finley']
const bios=['Coffee walks, campus photography and discovering new music.','Board games after class and trying a new place to eat.','Weekend trails, art projects and quiet study sessions.','Pickup sports, movie nights and a good playlist.','Sketchbooks, shared meals and exploring local parks.','Looking for a study buddy who also enjoys a coffee break.']
export function demoPlan(count=50,year=new Date().getUTCFullYear()){
 if(!Number.isInteger(count)||count<2||count>100)throw new Error('Choose2–100 demo accounts')
 return Array.from({length:count},(_,i)=>{
  const index=i+1,pair=Math.floor(i/2),identity=seedIdentity(index),age=20+pair%15
  const interests=Array.from(new Set([0,1,2,3].map(offset=>globalInterestChoices[(pair*2+offset)%globalInterestChoices.length])))
  const profile={username:identity.username,display_name:`Demo ${names[i%names.length]} ${String(index).padStart(2,'0')}`,bio:`Fictional local demo profile. ${bios[i%bios.length]}`,avatar_url:null,birthdate:`${year-age}-01-01`,location_city:campusLabel,interests,availability:[{dow:1+pair%5,start_time:'12:00:00',end_time:'17:00:00'},{dow:6,start_time:i%2?'17:00:00':'08:00:00',end_time:i%2?'21:00:00':'12:00:00'}]}
  const account:Account={...structuredClone(emptyAccount),profile,settings:{notifications:false,availability:false,discoverable:true,location:false},preferences:{intents:[['Activity partners','Close friends','Study buddies'][pair%3]],usual:[],distance:'Nearby',group:'One-on-one'},completed:[0,1,2,3]}
  SaveAccountSchema.parse(account)
  const dating:DatingProfile={...emptyDatingProfile(),gender:pair%4===0?(i%2?'Woman':'Man'):pair%4===1?'Man':pair%4===2?'Woman':'Nonbinary',sexuality:['Straight','Gay','Lesbian','Bisexual'][pair%4],intent:(['Long-term relationship','Something casual','Still figuring it out'] as const)[pair%3],style:(['Monogamy','Non-monogamy','Exploring my relationship style'] as const)[pair%3],heightInches:60+i%20,visibility:{gender:true,sexuality:i%3===0,height:i%4!==0},clarifiedTargets:pair%4===3?['Nonbinary']:[]}
  DatingProfileSchema.parse(dating)
  const filters={ageMin:pair===0?18:Math.max(18,age-4),ageMax:pair===0?99:age+5,radiusMiles:[5,10,15,25][pair%4],goals:[account.preferences.intents[0]],searchArea:{source:'temporary' as const,areaLabel:campusLabel,resolvedLocationRef:null}}
  FriendsPreferencesSchema.parse(filters)
  const facts={education:`${['Arts','Engineering','Science','Humanities'][pair%4]} student (demo)`,occupation:['Student','Research assistant (demo)','Campus tutor (demo)'][i%3],languages:i%3===0?['English','Spanish']:i%3===1?['English','Mandarin']:['English'],visibility:{education:true,occupation:i%2===0,languages:true}}
  ProfileFactsSchema.parse(facts)
  return{index,...identity,age,account,dating,filters,facts}
 })
}
export type DemoProfile=ReturnType<typeof demoPlan>[number]
export function developmentDemoPlan(count=60,year=new Date().getUTCFullYear()):DemoProfile[]{
 return demoPlan(count,year).map(profile=>{
  const dating=Math.floor((profile.index-1)/2)%3===2?profile.dating:{...profile.dating,gender:profile.index%2?'Man':'Woman',sexuality:'Straight',clarifiedTargets:[]}
  DatingProfileSchema.parse(dating)
  return {...profile,dating,filters:{...profile.filters,ageMin:18,ageMax:99}}
 })
}
export function onboardingChapters(account:Account):Account[]{
 if(!account.profile)throw new Error('Demo profile required')
 return [
  {...structuredClone(emptyAccount),settings:account.settings,profile:{...account.profile,interests:[],birthdate:null,location_city:null,availability:[]},completed:[0]},
  {...structuredClone(emptyAccount),settings:account.settings,profile:{...account.profile,birthdate:null,location_city:null,availability:[]},completed:[0,1]},
  {...structuredClone(emptyAccount),settings:account.settings,profile:{...account.profile,birthdate:null,location_city:null,availability:[]},preferences:{...account.preferences,distance:'',group:''},completed:[0,1,2]},
  account,
 ].map(value=>SaveAccountSchema.parse(value))
}
