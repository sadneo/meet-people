import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { usePrototype } from './context'
import { DEMO_CHAPTER_REWARD, interests, intents, type Profile } from './model'
import { Avatar, Brand, Button, Chips, Icon, Pebble, Pouch } from './ui'

const chapters = ['Basic profile', 'Interests', 'Social intent', 'Availability & preferences']
function firstIncomplete(completed: number[]) { return [0, 1, 2, 3].find(i => !completed.includes(i)) ?? 0 }

export function Onboarding() {
  const { state, dispatch, go } = usePrototype()
  const origin = useRef<HTMLElement>(null)
  const [flight, setFlight] = useState<CSSProperties>({})
  const [phase, setPhase] = useState<'opening' | 'chapters' | 'breaking' | 'ending'>(() => state.completed.length === 4 ? 'ending' : window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'chapters' : 'opening')
  const [chapter, setChapter] = useState(() => firstIncomplete(state.completed))
  const [profile, setProfile] = useState<Profile>(() => state.completed.length ? state.profile : { name: '', bio: '', photo: '', interests: [], intents: [], usual: [], distance: '5 miles', group: 'Either' })
  const advance = () => {
    if (state.completed.length === 4) setPhase('ending')
    else { setChapter(firstIncomplete(state.completed)); setPhase('chapters') }
  }
  useEffect(() => {
    if (phase !== 'opening' && phase !== 'breaking') return
    const timer = window.setTimeout(() => {
      if (phase === 'opening') setPhase('chapters')
      else if (state.completed.length === 4) setPhase('ending')
      else { setChapter(firstIncomplete(state.completed)); setPhase('chapters') }
    }, phase === 'opening' ? 4900 : window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 150 : 1250)
    return () => window.clearTimeout(timer)
  }, [phase, state.completed])
  const valid = [!!profile.photo && !!profile.name.trim() && !!profile.bio.trim(), profile.interests.length > 0, profile.intents.length > 0, profile.usual.length > 0][chapter]
  const update = (patch: Partial<Profile>) => setProfile(p => ({ ...p, ...patch }))
  const complete = () => {
    if (!valid || phase !== 'chapters') return
    // Bring the stone and pouch back into view before the mobile reward moment.
    if (window.innerWidth <= 620) origin.current?.scrollIntoView({ block: 'start', behavior: 'instant' })
    const ground = origin.current?.getBoundingClientRect()
    const stone = origin.current?.querySelector('.pt-chapter-stone.is-current')?.getBoundingClientRect()
    const pouch = origin.current?.querySelector('.pt-pouch-count > svg')?.getBoundingClientRect()
    if (ground && stone && pouch) {
      const x = stone.left + stone.width / 2
      const y = stone.top + stone.height / 2
      setFlight({ left: x - ground.left, top: y - ground.top, '--flight-x': `${pouch.left + pouch.width / 2 - x}px`, '--flight-y': `${pouch.top + pouch.height / 2 - y}px` } as CSSProperties)
    }
    dispatch({ type: 'chapter', chapter, profile: { ...profile, name: profile.name.trim(), bio: profile.bio.trim() } })
    setPhase('breaking')
  }
  return <section ref={origin} className={`pt-origin pt-origin-${phase}`}><header className="pt-origin-header"><Brand /><div className={`pt-pouch-count ${phase === 'breaking' || phase === 'ending' ? 'is-bouncing' : ''}`}><Pouch /><span aria-live="polite"><strong>{state.community.balance}</strong> Pebbles</span></div></header>{phase === 'breaking' && <div className="pt-reward-flight" style={flight} aria-hidden="true">{[0, 1, 2, 3, 4].map(i => <Pebble key={i} className={`pt-flight-${i}`} />)}</div>}{phase === 'opening' ? <div className="pt-cinematic"><svg className="pt-origin-grass" viewBox="0 0 800 420" aria-hidden="true"><g fill="#99b47a"><path d="M80 85h8v12h8V78h7v26H88v-6h-8ZM155 265h8v10h8v-19h7v26h-16v-7h-7ZM610 65h8v12h8V58h7v26h-17v-7h-6ZM688 270h8v12h8v-20h7v27h-17v-7h-6ZM95 350h25v6H95ZM570 340h26v6h-26Z" /></g><g fill="#bbc997"><path d="M170 80h12v5h-12ZM660 160h20v6h-20ZM210 355h16v6h-16ZM40 200h20v6H40ZM520 75h18v6h-18Z" /></g><g fill="#fff6df"><path d="M121 144h6v6h6v6h-6v6h-6v-6h-6v-6h6ZM651 313h6v6h6v6h-6v6h-6v-6h-6v-6h6Z" /></g><path fill="#d5b867" d="M121 150h6v6h-6ZM651 319h6v6h-6Z" /></svg><div className="pt-enormous-shadow" /><div className="pt-falling-boulder"><span /></div><div className="pt-opening-shards" aria-hidden="true">{[0, 1, 2, 3].map(i => <i key={i} className={`pt-shard-${i}`} />)}</div><div className="pt-impact-dust">{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ '--i': i } as CSSProperties} />)}</div><div className="pt-opening-caption"><h1>A little beginning.</h1><p>Make some space for your people.</p></div><button className="pt-skip" onClick={() => setPhase('chapters')}>Skip animation<Icon name="arrow" size={18} /></button></div> : phase === 'ending' ? <div className="pt-origin-ending"><div className="pt-community-seed"><div className="pt-old-stone-spaces">{chapters.map(c => <i key={c} />)}</div><span className="pt-seed-landmark"><Icon name="tree" size={68} /></span>{Array.from({ length: 7 }, (_, i) => <Pebble key={i} className={`pt-seed-stone pt-seed-${i}`} />)}</div><h1>Your Pebble is ready.</h1><p>{state.community.balance} demo Pebbles. Choose what to build in your community.</p><Button onClick={() => go('Home')}>Enter Pebble<Icon name="arrow" /></Button><span className="pt-hint">Profile choices stay in this demo until you refresh.</span></div> : <><div className="pt-origin-intro"><h1>A little about you</h1><p>Four pieces. A place to start.</p></div><div className="pt-origin-layout"><div className={`pt-stone-field pt-focus-${chapter}`}><div className="pt-stone-camera">{chapters.map((label, i) => <button key={label} disabled={phase === 'breaking' || (!state.completed.includes(i) && i !== firstIncomplete(state.completed))} className={`pt-chapter-stone pt-shard-${i} ${chapter === i ? 'is-current' : ''} ${state.completed.includes(i) ? 'is-collected' : ''}`} aria-label={`${label}${state.completed.includes(i) ? ', completed' : ''}`} onClick={() => setChapter(i)}><span>{state.completed.includes(i) ? <Icon name="check" size={24} /> : `0${i + 1}`}</span><strong>{label}</strong><svg viewBox="0 0 200 180" aria-hidden="true"><path d="m95 0-10 45 20 26-20 35 15 23-18 51m23-109 40-7 22 15m-62 27-50 12-31-15" /></svg></button>)}</div><p className="pt-stone-caption">{state.completed.length} of 4 pieces collected · +{DEMO_CHAPTER_REWARD} per chapter</p></div><form className="pt-chapter-form" onSubmit={e => { e.preventDefault(); complete() }}><div className="pt-step-row"><span>CHAPTER {chapter + 1} OF 4</span>{state.completed.includes(chapter) && <span>Completed</span>}</div><h2>{chapters[chapter]}</h2>{chapter === 0 && <><div className="pt-demo-photo"><button type="button" className="pt-photo-picker" onClick={() => update({ photo: 'you.jpg' })}>{profile.photo ? <Avatar person={profile} size="large" /> : <Icon name="profile" size={34} />}</button><div><Button secondary onClick={() => update({ photo: 'you.jpg' })}>{profile.photo ? 'Demo photo added' : 'Use demo photo'}</Button><p className="pt-hint">No upload. Just a placeholder.</p></div></div><label>Display name<input required maxLength={30} value={profile.name} onChange={e => update({ name: e.target.value })} autoComplete="off" placeholder="What should people call you?" /></label><label>A short bio<textarea required maxLength={160} value={profile.bio} onChange={e => update({ bio: e.target.value })} placeholder="A few things you’re into…" /></label></>}{chapter === 1 && <><p>What could you talk about for hours?</p><Chips label="Interests" options={interests} values={profile.interests} multi onChange={values => update({ interests: values })} /></>}{chapter === 2 && <><p>What would you like to find here?</p><Chips label="Social intent" options={intents} values={profile.intents} multi onChange={values => update({ intents: values })} /></>}{chapter === 3 && <><fieldset><legend>When are you usually free?</legend><Chips label="Usual free time" options={['Mornings', 'Afternoons', 'Evenings', 'Weekends']} values={profile.usual} multi onChange={values => update({ usual: values })} /></fieldset><label>Comfortable distance<select value={profile.distance} onChange={e => update({ distance: e.target.value })}><option>Nearby</option><option>5 miles</option><option>10 miles</option></select></label><fieldset><legend>You prefer</legend><Chips label="Group preference" options={['One-on-one', 'Small groups', 'Either']} values={[profile.group]} onChange={([group]) => update({ group })} /></fieldset></>}<Button type="submit" className="pt-wide" disabled={!valid || phase === 'breaking'}>{phase === 'breaking' ? 'Gathering your Pebbles…' : state.completed.includes(chapter) ? 'Save & continue' : 'Complete chapter'}<Icon name="arrow" /></Button>{phase === 'breaking' && <button type="button" className="pt-text-button" onClick={advance}>Skip animation</button>}<p className="pt-hint">Demo rewards only. No real currency or account.</p></form></div></>}</section>
}

export function Auth({ register = false }: { register?: boolean }) {
  const { go } = usePrototype()
  const [edge, setEdge] = useState(0)
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    if (!hidden) return
    const timer = window.setTimeout(() => { setEdge(previous => (previous + 1 + Math.floor(Math.random() * 3)) % 4); setHidden(false) }, 1400 + Math.random() * 1600)
    return () => window.clearTimeout(timer)
  }, [hidden])
  return <section className="pt-auth"><Brand /><div className="pt-auth-form"><h1>{register ? 'Make room for new people.' : 'Good to see you.'}</h1><p>{register ? 'Create your Pebble profile.' : 'Sign in to Pebble.'}</p><form onSubmit={e => { e.preventDefault(); go(register ? 'Onboarding' : 'Home') }}><label>Email<input type="email" required placeholder="you@university.edu" autoComplete="email" /></label><label>Password<input type="password" required minLength={8} placeholder="At least 8 characters" autoComplete={register ? 'new-password' : 'current-password'} /></label><Button type="submit" className="pt-wide">{register ? 'Create demo account' : 'Log in to demo'}<Icon name="arrow" /></Button><p className="pt-hint">Use made-up details. Nothing is sent or saved.</p></form><button className="pt-text-button" onClick={() => go(register ? 'Login' : 'Register')}>{register ? 'Already have an account? Log in' : 'New here? Create an account'}</button><button className="pt-text-button" onClick={() => go('Home')}>Explore the demo</button></div><button className={`pt-curious pt-edge-${edge} ${hidden ? 'is-hidden' : ''}`} aria-label="Say hello to the curious Pebble" onClick={() => setHidden(true)}><Pebble /></button></section>
}
