import { useEffect, useReducer, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { PrototypeContext, usePrototype } from '../features/prototype/context'
import { COMMUNITY_STORAGE_KEY, loadCommunity } from '../features/prototype/economy'
import { initialState, reducer, scenes, scenePaths, sceneSlug, type Scene } from '../features/prototype/model'
import { isEventDetailPath } from '../features/events/routes'
import { PouchIntro } from '../features/community/PouchIntro'
import '../features/community/motion.css'
import '../features/prototype/prototype.css'
import '../features/prototype/responsive.css'
import '../features/prototype/settings.css'
import '../features/prototype/calm.css'
import { Icon } from '../features/prototype/ui'
import { AccountBoundary } from '../auth/account'
import { useAccount } from '../auth/account-context'
import type { Action } from '../features/prototype/model'
import { profileToAccount, accountToProfile } from '../auth/profile'
import '../auth/account.css'
import NativeBridge from '../platform/NativeBridge'

export default function PebbleApp() {
  return <><NativeBridge /><AccountBoundary><PebbleWorkspace /></AccountBoundary></>
}

function PebbleWorkspace() {
  const account = useAccount()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const scene = isEventDetailPath(pathname) ? 'Event Detail' : scenes.find(value => scenePaths[value] === pathname) ?? 'Home'
  const [localState, localDispatch] = useReducer(reducer, initialState, initial => ({ ...initial, community: account?.session ? initial.community : loadCommunity() }))
  const state = account?.session ? { ...localState, profile: accountToProfile(account.account), settings: account.account.settings, completed: account.account.completed } : localState
  const dispatch = (action: Action) => {
    if (account?.session && (action.type === 'profile' || action.type === 'chapter' || action.type === 'setting')) {
      if (action.type === 'setting') {
        void account.save({ ...account.account, settings: { ...account.account.settings, [action.key]: action.value } })
      } else {
        const next = profileToAccount(action.profile, account.account, account.session.user.id)
        if (action.type === 'chapter') next.completed = [...new Set([...next.completed, action.chapter])].sort()
        void account.save(next)
      }
    } else localDispatch(action)
  }
  const [introRun, setIntroRun] = useState(0)
  const [devOpen, setDevOpen] = useState(false)
  const [empty, setEmpty] = useState(false)
  const [personId, setPersonId] = useState('jamie')
  const [eventId, setEventId] = useState('acoustic')
  const [chatPerson, setChatPerson] = useState<string | null>(null)

  useEffect(() => {
    if (account?.session) return
    try { localStorage.setItem(COMMUNITY_STORAGE_KEY, JSON.stringify(state.community)) }
    catch { console.warn('Pebble community storage unavailable; changes last for this session only.') }
  }, [state.community, account?.session])

  const go = (next: Scene) => {
    if (next === 'Intro') setIntroRun(run => run + 1)
    if (next === 'Confirmed') setChatPerson(null)
    navigate(scenePaths[next])
  }

  return <PrototypeContext.Provider value={{ state, dispatch, scene, go, empty, setEmpty, personId, setPersonId, eventId, setEventId, chatPerson, setChatPerson }}>
    <div className={`pt-app pt-scene-${sceneSlug(scene)}`}>
      {import.meta.env.DEV && <div className="pt-dev-panel"><button className="pt-dev-tab" aria-label="Developer controls" title="Developer controls" aria-expanded={devOpen} aria-controls="pt-dev-controls" onClick={() => setDevOpen(value => !value)}><Icon name="code" size={16} /></button><aside id="pt-dev-controls" hidden={!devOpen} className="pt-review-tools" aria-label="Development scene switcher">
        <strong>DEV · Design review</strong>
        <label><span className="pt-sr-only">Review scene</span><select aria-label="Review scene" value={scene} onChange={event => go(event.target.value as Scene)}>{scenes.map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="pt-empty-toggle"><input type="checkbox" checked={empty} onChange={event => setEmpty(event.target.checked)} />Empty states</label>
        <div className="pt-dev-economy">
          {scene === 'Intro' && <button onClick={() => setIntroRun(run => run + 1)}>Replay Intro</button>}
          <button onClick={() => dispatch({ type: 'demo-funds' })}>Add 100 demo Pebbles</button>
          <button title="Resets balance and upgrades; keeps earned chapter history" onClick={() => dispatch({ type: 'reset-community' })}>Reset community/upgrades</button>
        </div>
        <small>Community history uses isolated demo activity. Purchases use your saved local balance.</small>
        <small>Home people are fictional profile previews, not live presence. Refresh only cycles local samples.</small>
      </aside></div>}
      <Outlet key={scene === 'Intro' ? introRun : undefined} />
    </div>
  </PrototypeContext.Provider>
}

export function ImmersiveLayout() {
  return <main className="pt-main pt-immersive"><Outlet /></main>
}

export function IntroScreen() {
  const { go } = usePrototype()
  return <div className="pt-intro-stage"><PouchIntro onFinish={() => go('Home')} /></div>
}
