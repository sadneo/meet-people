import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { usePrototype } from './context'
import { upgrades } from './economy'
import { CommunityWorld, UpgradePicture } from './CommunityWorld'
import { CommunityAreas } from './CommunityAreas'
import { CommunityHistory } from './CommunityHistory'
import { communityWeek } from './community-history'
import { PebbleBalance } from './Home'
import { Icon } from './ui'
import { BuildIcon, CurrencyIcon } from '../pebble-art/PixelArt'

export function PebbleGarden() {
  const { state, dispatch } = usePrototype()
  const [week, setWeek] = useState(0)
  const [selected, setSelected] = useState(6)
  const [area, setArea] = useState(0)
  const [announcement, setAnnouncement] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const days = communityWeek(week)
  const close = () => { dialog.current?.close(); trigger.current?.focus() }
  return <section className="pt-community-page" aria-label="Pebble community">
    <header className="pt-community-heading"><Link to="/" className="pt-icon-button pt-quiet-icon" aria-label="Back to Home" title="Back to Home"><Icon name="back" size={24} /></Link><div className="pt-community-controls"><PebbleBalance /><span className="pt-build-slot">{area === 0 && <button ref={trigger} className="pt-icon-button pt-build-control" aria-label="Build your community" title="Build your community" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}><BuildIcon /></button>}</span></div></header>
    <CommunityAreas area={area} onAreaChange={setArea}><CommunityWorld owned={state.community.owned} stage={days[selected].stage} />
    <CommunityHistory days={days} selected={selected} week={week} select={setSelected} changeWeek={value => { setWeek(value); setSelected(6) }} /></CommunityAreas>
    <dialog ref={dialog} className="pt-build-dialog" aria-labelledby="pt-upgrade-title" onCancel={event => { event.preventDefault(); close() }}>
      <header><div><h2 id="pt-upgrade-title">Build your community</h2><p className="pt-build-balance"><CurrencyIcon /><span><strong>{state.community.balance}</strong> Pebbles available</span></p></div><button className="pt-icon-button" aria-label="Close upgrades" title="Close upgrades" onClick={close}><Icon name="close" size={24} /></button></header>
      <div className="pt-upgrade-list">{upgrades.map(upgrade => {
        const owned = state.community.owned.includes(upgrade.id)
        const affordable = state.community.balance >= upgrade.cost
        return <article key={upgrade.id} className="pt-upgrade-item" aria-label={upgrade.name}>
          <UpgradePicture id={upgrade.id} /><div><h3>{upgrade.name}</h3><p>{upgrade.detail}</p><div className="pt-upgrade-purchase"><span>{upgrade.cost} Pebbles</span><button className="pt-button" disabled={owned || !affordable} aria-label={`${owned ? 'Owned' : 'Build'} ${upgrade.name}`} onClick={() => { dispatch({ type: 'build', id: upgrade.id }); setAnnouncement(`${upgrade.name} built. ${upgrade.cost} Pebbles spent.`) }}>{owned ? 'Owned' : 'Build'}</button></div>{!owned && !affordable && <small>{upgrade.cost - state.community.balance} more Pebbles needed</small>}</div>
        </article>
      })}</div>
      <p className="pt-sr-only" role="status">{announcement}</p>
    </dialog>
  </section>
}
