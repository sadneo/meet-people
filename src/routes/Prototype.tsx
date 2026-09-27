import { useEffect, useReducer, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { PrototypeContext } from '../features/prototype/context'
import { initialState, reducer, scenes, sceneSlug, type Scene } from '../features/prototype/model'
import { Brand, Icon, Pebble } from '../features/prototype/ui'
import { Auth, Onboarding } from '../features/prototype/Onboarding'
import { EventDetail, EventsScreen } from '../features/prototype/Browse'
import { ActivityPaths, ConfirmedPlan, FreeTime, Matches, Planning, ReviewPlan } from '../features/prototype/Planning'
import { Chat, Connection, Messages, ProfileScreen, Settings } from '../features/prototype/Social'
import { CommunityHome } from '../features/prototype/CommunityHome'
import { COMMUNITY_STORAGE_KEY, loadCommunity } from '../features/prototype/economy'
import { PouchIntro } from '../features/community/PouchIntro'
import '../features/community/motion.css'
import '../features/prototype/prototype.css'
import '../features/prototype/responsive.css'

const tabs: { label: Scene; icon: string }[] = [{ label: 'Events', icon: 'events' }, { label: 'Free Time', icon: 'time' }, { label: 'Home', icon: 'home' }, { label: 'Messages', icon: 'messages' }, { label: 'Profile', icon: 'profile' }]
export default function Prototype() {
  const [params, setParams] = useSearchParams()
  const scene = scenes.find(value => sceneSlug(value) === params.get('scene')) ?? 'Home'
  const [state, dispatch] = useReducer(reducer, initialState, initial => ({ ...initial, community: loadCommunity() }))
  const [introRun, setIntroRun] = useState(0)
  useEffect(() => {
    try { localStorage.setItem(COMMUNITY_STORAGE_KEY, JSON.stringify(state.community)) }
    catch { console.warn('Pebble community storage unavailable; changes last for this session only.') }
  }, [state.community])
  const [empty, setEmpty] = useState(false)
  const [personId, setPersonId] = useState('jamie')
  const [eventId, setEventId] = useState('acoustic')
  const [chatPerson, setChatPerson] = useState<string | null>(null)
  const main = useRef<HTMLElement>(null)
  const go = (next: Scene) => { if (next === 'Intro') setIntroRun(run => run + 1); setParams({ scene: sceneSlug(next) }); if (next === 'Confirmed') setChatPerson(null) }
  useEffect(() => { main.current?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }) }, [scene])
  const immersive = ['Intro', 'Login', 'Register', 'Onboarding'].includes(scene)
  const activeTab = scene === 'Event Detail' ? 'Events' : ['Free Time Match', 'Activities', 'Planning', 'Review', 'Confirmed', 'Connection'].includes(scene) ? 'Free Time' : scene === 'Chat' ? 'Messages' : ['Other User Profile', 'Settings'].includes(scene) ? 'Profile' : scene
  let screen
  switch (scene) {
    case 'Intro': screen = <div className="pt-intro-stage" key={introRun}><PouchIntro onFinish={() => go('Home')} /></div>; break
    case 'Login': screen = <Auth />; break
    case 'Register': screen = <Auth register />; break
    case 'Onboarding': screen = <Onboarding />; break
    case 'Events': screen = <EventsScreen />; break
    case 'Event Detail': screen = <EventDetail />; break
    case 'Free Time': screen = <FreeTime />; break
    case 'Free Time Match': screen = <Matches />; break
    case 'Activities': screen = <ActivityPaths />; break
    case 'Planning': screen = <Planning />; break
    case 'Review': screen = <ReviewPlan />; break
    case 'Confirmed': screen = <ConfirmedPlan />; break
    case 'Messages': screen = <div className="pt-messages-workspace"><section className="pt-inbox-pane"><Messages /></section><section className="pt-conversation-pane"><Chat /></section></div>; break
    case 'Chat': screen = <div className="pt-messages-workspace"><section className="pt-inbox-pane"><Messages /></section><section className="pt-conversation-pane"><Chat /></section></div>; break
    case 'Connection': screen = <Connection />; break
    case 'Profile': screen = <ProfileScreen />; break
    case 'Other User Profile': screen = <ProfileScreen other />; break
    case 'Settings': screen = <Settings />; break
    default: screen = <CommunityHome />
  }
  return <PrototypeContext.Provider value={{ state, dispatch, scene, go, empty, setEmpty, personId, setPersonId, eventId, setEventId, chatPerson, setChatPerson }}><div className={`pt-app pt-scene-${sceneSlug(scene)}`}>{import.meta.env.DEV && <aside className="pt-review-tools" aria-label="Development scene switcher"><strong>DEV · Design review</strong><label><span className="pt-sr-only">Review scene</span><select aria-label="Review scene" value={scene} onChange={e => go(e.target.value as Scene)}>{scenes.map(value => <option key={value}>{value}</option>)}</select></label><label className="pt-empty-toggle"><input type="checkbox" checked={empty} onChange={e => setEmpty(e.target.checked)} />Empty states</label><div className="pt-dev-economy">{scene === 'Intro' && <button onClick={() => setIntroRun(run => run + 1)}>Replay Intro</button>}<button onClick={() => dispatch({ type: 'demo-funds' })}>Add 100 demo Pebbles</button><button title="Resets balance and upgrades; keeps earned chapter history" onClick={() => dispatch({ type: 'reset-community' })}>Reset community/upgrades</button></div></aside>}{!immersive && scene !== 'Home' && <div className="pt-topbar"><button aria-label="Pebble home" onClick={() => go('Home')}><Brand /></button><span>Campus <span className="pt-campus-dot" /></span></div>}<main ref={main} className={`pt-main ${immersive ? 'pt-immersive' : ''}`} key={scene}>{screen}</main>{!immersive && <nav className="pt-bottom-nav" aria-label="Prototype navigation">{tabs.map(tab => <button key={tab.label} className={`${activeTab === tab.label ? 'is-active' : ''} ${tab.label === 'Home' ? 'pt-home-tab' : ''}`} aria-current={activeTab === tab.label ? 'page' : undefined} onClick={() => go(tab.label)}>{tab.label === 'Home' ? <Pebble /> : <Icon name={tab.icon} />}<span>{tab.label}</span></button>)}</nav>}</div></PrototypeContext.Provider>
}
