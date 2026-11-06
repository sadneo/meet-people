import { useRef, useState } from 'react'
import type { GardenResponse, GardenRewardAction } from '../../../shared/garden'
import { Modal } from '../../ui/common'

const days=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
export function EarnPebbles({rewards,disabled,claim,close,error,refresh}:{rewards?:GardenResponse['rewards'];disabled:boolean;claim:(action:GardenRewardAction)=>Promise<unknown>;close:()=>void;error:string;refresh:()=>void}){
 const [message,setMessage]=useState('')
 const collectedSummary=useRef<HTMLElement>(null)
 const collect=async(action:GardenRewardAction)=>{setMessage('');if(await claim(action)){setMessage('Pebbles added to your Garden.');requestAnimationFrame(()=>collectedSummary.current?.focus())}}
 const social=rewards?.social
 const quests=[
  {id:'daily',collected:!!rewards?.checkedIn,content:(<article key="daily"><div><h3>Daily check-in <span>+20</span></h3></div><button className="btn light" disabled={disabled||!rewards||rewards.checkedIn} onClick={()=>void collect('check-in')}>{rewards?.checkedIn?'Collected':'Check in'}</button></article>)},
  {id:'weekly',collected:!!rewards?.weeklyBonus,content:(<article key="weekly" className="garden-week-reward"><div className="garden-week-heading"><h3>Come back five days <span>+50</span></h3><p>{rewards?.weeklyBonus?'Bonus collected':`${Math.min(rewards?.weekDays??0,5)} / 5 days`}</p></div>
    {rewards?.weekStart&&rewards.checkInDays?<ol className="garden-check-in-week" aria-label="This week’s check-ins">{days.map((day,index)=>{
     const date=new Date(`${rewards.weekStart}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+index)
     const key=date.toISOString().slice(0,10),checked=rewards.checkInDays!.includes(key)
     return <li key={day} aria-label={`${day}: ${checked?'checked in':'not checked in'}`} aria-current={key===rewards.day?'date':undefined}><span className={checked?'checked':''} aria-hidden="true">{checked?'✓':''}</span><small aria-hidden="true">{day.slice(0,1)}</small></li>
    })}</ol>:null}</article>)},
  {id:'onboarding',collected:!!rewards?.profileClaimed,content:(<article key="onboarding"><div><h3>Complete onboarding <span>+100</span></h3></div><button className="btn light" disabled={disabled||!rewards?.profileEligible||rewards.profileClaimed} onClick={()=>void collect('profile-reward')}>{rewards?.profileClaimed?'Collected':'Collect'}</button></article>)},
  {id:'connection',collected:social?.connectionsClaimed===2,content:(<article key="connection"><div><h3>Build a connection <span>+30</span></h3>{social&&<p>{social.connectionsClaimed} / 2 collected this week</p>}</div><button className="btn light" aria-label="Collect connection reward" disabled={disabled||!social?.connectionAvailable} onClick={()=>void collect('connection-reward')}>{social?.connectionAvailable?'Collect':social?.connectionsClaimed===2?'Collected':'Not yet'}</button></article>)},
  {id:'keep-in-touch',collected:!!social?.keepInTouchClaimed,content:(<article key="keep-in-touch"><div><h3>Keep in touch <span>+20</span></h3></div><button className="btn light" aria-label="Collect keep-in-touch reward" disabled={disabled||!social?.keepInTouchAvailable} onClick={()=>void collect('keep-in-touch')}>{social?.keepInTouchClaimed?'Collected':social?.keepInTouchAvailable?'Collect':'Not yet'}</button></article>)}
 ]
 const completed=quests.filter(quest=>quest.collected)
 return <Modal title="Earn Pebbles" className="garden-earn-modal" close={close}>
  <div className="garden-earn-content">
   {error&&<div><p role="alert">{error}</p><button className="btn light" onClick={refresh}>Refresh Garden</button></div>}
   <div className="garden-active-quests">{quests.filter(quest=>!quest.collected).map(quest=>quest.content)}</div>
   {completed.length>0&&<details className="garden-collected-quests"><summary ref={collectedSummary}>Collected ({completed.length})</summary>{completed.map(quest=>quest.content)}</details>}
   <details className="garden-reward-rules"><summary>How rewards work</summary><p>300 Pebbles to start. Daily check-ins reset at midnight UTC. The five-day bonus is added automatically; weeks run Monday–Sunday, UTC.</p><p>Connection rewards need confirmed accounts at least 7 days old and an accepted connection. Both people must chat on two shared days at least 24 hours apart, within the last 30 days. Each person can earn once per connection, up to twice a week.</p><p>Keep in touch: once a week, with a previously rewarded connection. Both chat again on two days this week, at least 24 hours apart and at least 7 days after the first reward. Blocked or inactive connections don’t count.</p><p>More messages don’t earn more. Pebbles stay in your account and can’t be transferred or exchanged for cash.</p></details>
   <p role="status">{message}</p>
  </div>
 </Modal>
}
