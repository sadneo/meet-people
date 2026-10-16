import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { usePrototype } from './context'
import { DEMO_CHAPTER_REWARD, interests, intents } from './model'
import { Avatar, Brand, Button, Chips, Icon, Pebble } from './ui'
import { useAccount } from '../../auth/account-context'
import { profileToAccount } from '../../auth/profile'
import { safeReturnTo } from '../../auth/returnTo'
import { useLogout } from '../../auth/useLogout'
import { CurrencyIcon } from '../pebble-art/PixelArt'

const chapters = ['Basic profile', 'Interests', 'Social intent', 'Availability & preferences']
function firstIncomplete(completed: number[]) { return [0, 1, 2, 3].find(i => !completed.includes(i)) ?? 0 }
export function Onboarding() {
  const { state, dispatch, go } = usePrototype()
  const account = useAccount()
  const logout = useLogout()
  const { search } = useLocation()
  const navigate = useNavigate()
  const origin = useRef<HTMLElement>(null)
  const [flight, setFlight] = useState<CSSProperties>({})
  const [chapter, setChapter] = useState(state.completed.length < 4 ? state.completed.length : 0)
  const [profile, setProfile] = useState(state.completed.length || account?.session ? state.profile : { name: '', bio: '', photo: '', interests: [], intents: [], usual: [], distance: '5 miles', group: 'Either' })
  const [phase, setPhase] = useState<'opening' | 'chapters' | 'breaking' | 'ending'>(() => state.completed.length === 4 ? 'ending' : state.completed.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'chapters' : 'opening')
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
  const valid = [Boolean(profile.name.trim() && profile.bio.trim()), profile.interests.length > 0, profile.intents.length > 0, profile.usual.length > 0][chapter]
  const update = (patch: Partial<typeof profile>) => setProfile(previous => ({ ...previous, ...patch }))
  const complete = async () => {
    if (!valid || account?.busy || phase !== 'chapters') return
    if (account?.session) {
      const next = profileToAccount(profile, account.account, account.session.user.id)
      next.completed = [...new Set([...next.completed, chapter])].sort()
      if (!await account.save(next)) return
    } else {
      if (window.matchMedia('(max-width: 800px)').matches) origin.current?.scrollIntoView({ block: 'start', behavior: 'instant' })
      const ground = origin.current?.getBoundingClientRect()
      const stone = origin.current?.querySelector('.pt-chapter-stone.is-current')?.getBoundingClientRect()
      const pouch = origin.current?.querySelector('.pt-pouch-count > svg')?.getBoundingClientRect()
      if (ground && stone && pouch) {
        const x = stone.left + stone.width / 2, y = stone.top + stone.height / 2
        setFlight({ left: x - ground.left, top: y - ground.top, '--flight-x': `${pouch.left + pouch.width / 2 - x}px`, '--flight-y': `${pouch.top + pouch.height / 2 - y}px` } as CSSProperties)
      }
      dispatch({ type: 'chapter', chapter, profile })
    }
    setPhase('breaking')
  }
  const finish = () => account?.session ? navigate(safeReturnTo(new URLSearchParams(search).get('returnTo')) ?? '/', { replace: true }) : go('Home')
  return <section ref={origin} className={`pt-origin pt-origin-${phase}`}>
    <header className="pt-origin-header"><Brand />{account?.session ? <Button secondary disabled={account.busy || logout.busy} onClick={() => void logout.logout()}>Log out</Button> : <div className={`pt-pouch-count ${phase === 'breaking' || phase === 'ending' ? 'is-bouncing' : ''}`}><CurrencyIcon /><span aria-live="polite"><strong>{state.community.balance}</strong> Pebbles</span></div>}</header>
    {logout.error && <p role="alert">{logout.error}</p>}
    {phase === 'breaking' && !account?.session && <div className="pt-reward-flight" style={flight} aria-hidden="true">{[0, 1, 2, 3, 4].map(i => <Pebble key={i} className={`pt-flight-${i}`} />)}</div>}
    {phase === 'opening' ? <div className="pt-cinematic"><svg className="pt-origin-grass" viewBox="0 0 800 420" aria-hidden="true"><g fill="#99b47a"><path d="M80 85h8v12h8V78h7v26H88v-6h-8ZM155 265h8v10h8v-19h7v26h-16v-7h-7ZM610 65h8v12h8V58h7v26h-17v-7h-6ZM688 270h8v12h8v-20h7v27h-17v-7h-6ZM95 350h25v6H95ZM570 340h26v6h-26Z" /></g><g fill="#bbc997"><path d="M170 80h12v5h-12ZM660 160h20v6h-20ZM210 355h16v6h-16ZM40 200h20v6H40ZM520 75h18v6h-18Z" /></g><g fill="#fff6df"><path d="M121 144h6v6h6v6h-6v6h-6v-6h-6v-6h6ZM651 313h6v6h6v6h-6v6h-6v-6h-6v-6h6Z" /></g><path fill="#d5b867" d="M121 150h6v6h-6ZM651 319h6v6h-6Z" /></svg><div className="pt-enormous-shadow" /><div className="pt-falling-boulder"><span /></div><div className="pt-opening-shards" aria-hidden="true">{[0, 1, 2, 3].map(i => <i key={i} className={`pt-shard-${i}`} />)}</div><div className="pt-impact-dust">{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ '--i': i } as CSSProperties} />)}</div><div className="pt-opening-caption"><h1>A little beginning.</h1><p>Make some space for your people.</p></div><button className="pt-skip" onClick={() => setPhase('chapters')}>Skip animation<Icon name="arrow" size={18} /></button></div> : phase === 'ending' ? <div className="pt-origin-ending"><div className="pt-community-seed"><div className="pt-old-stone-spaces">{chapters.map(c => <i key={c} />)}</div><span className="pt-seed-landmark"><Icon name="tree" size={68} /></span>{Array.from({ length: 7 }, (_, i) => <Pebble key={i} className={`pt-seed-stone pt-seed-${i}`} />)}</div><h1>Your Pebble is ready.</h1><p>{account?.session ? 'Your profile and preferences are saved to your account.' : `${state.community.balance} demo Pebbles. Choose what to build in your community.`}</p><Button secondary onClick={finish}>Enter Pebble<Icon name="arrow" /></Button></div> : <>
      <div className="pt-origin-intro"><h1>A little about you</h1><p>Four pieces. A place to start.</p></div>
      <div className="pt-origin-layout"><div className={`pt-stone-field pt-focus-${chapter}`}><div className="pt-stone-camera">{chapters.map((label, i) => <button key={label} disabled={account?.busy || phase === 'breaking' || (!state.completed.includes(i) && i !== firstIncomplete(state.completed))} className={`pt-chapter-stone pt-shard-${i} ${chapter === i ? 'is-current' : ''} ${state.completed.includes(i) ? 'is-collected' : ''}`} aria-label={`${label}${state.completed.includes(i) ? ', completed' : ''}`} onClick={() => setChapter(i)}><span>{state.completed.includes(i) ? <Icon name="check" size={24} /> : `0${i + 1}`}</span><strong>{label}</strong><svg viewBox="0 0 200 180" aria-hidden="true"><path d="m95 0-10 45 20 26-20 35 15 23-18 51m23-109 40-7 22 15m-62 27-50 12-31-15" /></svg></button>)}</div><p className="pt-stone-caption">{state.completed.length} of 4 pieces collected{!account?.session && ` · +${DEMO_CHAPTER_REWARD} per chapter`}</p></div>
        <form className="pt-chapter-form" onSubmit={event => { event.preventDefault(); void complete() }}><fieldset disabled={account?.busy}>
          <div className="pt-step-row"><span>Chapter {chapter + 1} of 4</span>{state.completed.includes(chapter) && <span>Completed</span>}</div><h2>{chapters[chapter]}</h2>
          {chapter === 0 && <>{account?.session ? <><div className="pt-demo-photo"><Avatar person={profile} size="large" /><p className="pt-hint">A photo is optional. Leave it blank for now.</p></div><label>Photo URL (HTTPS, optional)<input type="url" maxLength={2048} pattern="https://.*" value={profile.photo} onChange={event => update({ photo: event.target.value })} placeholder="https://…" /></label></> : <div className="pt-demo-photo"><button type="button" className="pt-photo-picker" onClick={() => update({ photo: 'you.jpg' })}>{profile.photo ? <Avatar person={profile} size="large" /> : <Icon name="profile" size={34} />}</button><div><Button secondary onClick={() => update({ photo: 'you.jpg' })}>{profile.photo ? 'Demo photo added' : 'Use demo photo'}</Button><p className="pt-hint">Optional placeholder. No upload.</p></div></div>}
            <label>Display name<input required maxLength={30} value={profile.name} onChange={event => update({ name: event.target.value })} autoComplete="nickname" placeholder="What should people call you?" /></label>
            <label>A short bio<textarea required maxLength={160} value={profile.bio} onChange={event => update({ bio: event.target.value })} placeholder="A few things you’re into…" /></label></>}
          {chapter === 1 && <><p>What could you talk about for hours?</p><Chips label="Interests" options={interests} values={profile.interests} multi onChange={values => update({ interests: values })} /></>}
          {chapter === 2 && <><p>What would you like to find here?</p><Chips label="Social intent" options={intents} values={profile.intents} multi onChange={values => update({ intents: values })} /></>}
          {chapter === 3 && <><fieldset><legend>When are you usually free?</legend><Chips label="Usual free time" options={['Mornings', 'Afternoons', 'Evenings', 'Weekends']} values={profile.usual} multi onChange={values => update({ usual: values })} /><p className="pt-hint">Mornings: 8–12, afternoons: 12–17, evenings: 17–21 daily. Weekends: 8–21 Saturday/Sunday. Times use America/New_York. Fine-tune weekly windows in matchmaking preferences.</p></fieldset>
            <label>Comfortable distance<select value={profile.distance} onChange={event => update({ distance: event.target.value })}><option>Nearby</option><option>5 miles</option><option>10 miles</option></select></label>
            <fieldset><legend>You prefer</legend><Chips label="Group preference" options={['One-on-one', 'Small groups', 'Either']} values={[profile.group]} onChange={([group]) => update({ group })} /></fieldset></>}
          <Button type="submit" secondary className="pt-wide" disabled={!valid || account?.busy || phase === 'breaking'}>{account?.busy ? 'Saving…' : phase === 'breaking' ? account?.session ? 'Chapter complete…' : 'Gathering your Pebbles…' : state.completed.includes(chapter) ? 'Save & continue' : 'Complete chapter'}<Icon name="arrow" /></Button>
          {phase === 'breaking' && <button type="button" className="pt-text-button" onClick={advance}>Skip animation</button>}
          <p className="pt-hint">{account?.session ? 'Each completed step is saved to your account.' : 'Guest preview only. Sign in to save your profile.'}</p>
        </fieldset></form>
      </div>
    </>}
  </section>
}
