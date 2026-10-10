import { useEffect, useReducer, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { PrototypeContext, usePrototype } from '../features/prototype/context'
import { COMMUNITY_STORAGE_KEY, loadCommunity } from '../features/prototype/economy'
import { DOWNTIME_STORAGE_KEY, initialState, reducer, scenes, scenePaths, sceneSlug, type Scene, type State } from '../features/prototype/model'
import { isEventDetailPath } from '../features/events/routes'
import { PouchIntro } from '../features/community/PouchIntro'
import '../features/community/motion.css'
import '../features/prototype/prototype.css'
import '../features/prototype/responsive.css'
import '../features/prototype/settings.css'

export default function PebbleApp() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const scene = isEventDetailPath(pathname) ? 'Event Detail' : scenes.find(value => scenePaths[value] === pathname) ?? 'Home'
  const [state, dispatch] = useReducer(reducer, initialState, loadState)
  const [introRun, setIntroRun] = useState(0)
  const [empty, setEmpty] = useState(false)
  const [personId, setPersonId] = useState('jamie')
  const [eventId, setEventId] = useState('acoustic')
  const [chatPerson, setChatPerson] = useState<string | null>(null)

  useEffect(() => {
    try { localStorage.setItem(COMMUNITY_STORAGE_KEY, JSON.stringify(state.community)) }
    catch { console.warn('Pebble community storage unavailable; changes last for this session only.') }
  }, [state.community])

  useEffect(() => {
    try { localStorage.setItem(DOWNTIME_STORAGE_KEY, String(state.settings.downtime)) }
    catch { console.warn('Pebble settings storage unavailable; changes last for this session only.') }
  }, [state.settings.downtime])

  const go = (next: Scene) => {
    if (next === 'Intro') setIntroRun(run => run + 1)
    if (next === 'Confirmed') setChatPerson(null)
    navigate(scenePaths[next])
  }

  return <PrototypeContext.Provider value={{ state, dispatch, scene, go, empty, setEmpty, personId, setPersonId, eventId, setEventId, chatPerson, setChatPerson }}>
    <div className={`pt-app pt-scene-${sceneSlug(scene)}`}>
      {import.meta.env.DEV && <aside className="pt-review-tools" aria-label="Development scene switcher">
        <strong>DEV · Design review</strong>
        <label><span className="pt-sr-only">Review scene</span><select aria-label="Review scene" value={scene} onChange={event => go(event.target.value as Scene)}>{scenes.map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="pt-empty-toggle"><input type="checkbox" checked={empty} onChange={event => setEmpty(event.target.checked)} />Empty states</label>
        <div className="pt-dev-economy">
          {scene === 'Intro' && <button onClick={() => setIntroRun(run => run + 1)}>Replay Intro</button>}
          <button onClick={() => dispatch({ type: 'demo-funds' })}>Add 100 demo Pebbles</button>
          <button title="Resets balance and upgrades; keeps earned chapter history" onClick={() => dispatch({ type: 'reset-community' })}>Reset community/upgrades</button>
        </div>
      </aside>}
      <Outlet key={scene === 'Intro' ? introRun : undefined} />
    </div>
  </PrototypeContext.Provider>
}

function loadState(initial: State): State {
  let downtime = false
  try { downtime = localStorage.getItem(DOWNTIME_STORAGE_KEY) === 'true' } catch { /* storage unavailable */ }
  return { ...initial, community: loadCommunity(), settings: { ...initial.settings, downtime } }
}

export function ImmersiveLayout() {
  return <main className="pt-main pt-immersive"><Outlet /></main>
}

export function IntroScreen() {
  const { go } = usePrototype()
  return <div className="pt-intro-stage"><PouchIntro onFinish={() => go('Home')} /></div>
}
