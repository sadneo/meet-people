import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { usePrototype } from './context'
import { upgrades } from './economy'
import { CommunityWorld, UpgradePicture } from './CommunityWorld'
import { Button, Icon, Pebble, Pouch } from './ui'

export function PebbleGarden() {
  const { state, dispatch } = usePrototype()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const trigger = useRef<HTMLButtonElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (!open) return
    title.current?.focus({ preventScroll: true })
    // Buying disables the focused Build button; Escape must also work if focus moves to body.
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() }
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [open])
  const close = () => { setOpen(false); trigger.current?.focus() }
  return <section className="pt-community-home" aria-label="Pebble community" onKeyDown={event => { if (event.key === 'Escape' && open) close() }}>
    <h1 className="pt-sr-only" tabIndex={-1}>Your Pebble community</h1>
    <CommunityWorld owned={state.community.owned} />
    <div className="pt-world-wallet" aria-label="Pebble balance"><Pouch /><span><strong key={state.community.balance}>{state.community.balance}</strong><span>Pebbles</span></span></div>
    <aside className="pt-matchmaking-entry" aria-labelledby="pt-matchmaking-entry-title">
      <div className="pt-matchmaking-entry-pebbles" aria-hidden="true"><Pebble /><Pebble expression="surprised" /><Pebble /></div>
      <div className="pt-matchmaking-entry-copy">
        <span>FRIENDS FIRST</span>
        <h2 id="pt-matchmaking-entry-title">Find your people</h2>
        <p>Shared interests. Free time. Nearby plans.</p>
        <small>Groups of 3–5 · simulated demo</small>
      </div>
      <div className="pt-matchmaking-actions"><Button onClick={() => navigate('/matchmaking')}>Start matching<Icon name="arrow" /></Button><Button secondary onClick={() => navigate('/downtime-matchmaking')}>Match while away<Icon name="time" /></Button></div>
    </aside>
    <div className={`pt-upgrade-panel ${open ? 'is-open' : ''}`}>
      <button ref={trigger} className="pt-upgrade-tab" aria-label={open ? 'Close community upgrades' : 'Build your community'} aria-expanded={open} aria-controls="pt-upgrades" onClick={() => open ? close() : setOpen(true)}><Icon name={open ? 'arrow' : 'back'} /><span>Build</span></button>
      <aside id="pt-upgrades" className="pt-upgrade-drawer" aria-hidden={!open} aria-labelledby="pt-upgrade-title" inert={!open ? true : undefined}>
        <header><div><h2 id="pt-upgrade-title" ref={title} tabIndex={-1}>Build your community</h2><p><strong>{state.community.balance}</strong> Pebbles available</p></div><button className="pt-icon-button" aria-label="Close upgrades" onClick={close}><Icon name="close" /></button></header>
        <div className="pt-upgrade-list">{upgrades.map(upgrade => {
          const owned = state.community.owned.includes(upgrade.id)
          const affordable = state.community.balance >= upgrade.cost
          return <article key={upgrade.id} className="pt-upgrade-item" aria-label={upgrade.name}>
            <UpgradePicture id={upgrade.id} /><div><h3>{upgrade.name}</h3><p>{upgrade.detail}</p><div className="pt-upgrade-purchase"><span>{upgrade.cost} Pebbles</span><button className="pt-button" disabled={owned || !affordable} aria-label={`${owned ? 'Owned' : 'Build'} ${upgrade.name}`} onClick={() => { dispatch({ type: 'build', id: upgrade.id }); setAnnouncement(`${upgrade.name} built. ${upgrade.cost} Pebbles spent.`) }}>{owned ? 'Owned' : 'Build'}</button></div>{!owned && !affordable && <small>{upgrade.cost - state.community.balance} more Pebbles needed</small>}</div>
          </article>
        })}</div>
      </aside>
    </div>
    <p className="pt-build-announcement pt-sr-only" role="status">{announcement}</p>
  </section>
}
