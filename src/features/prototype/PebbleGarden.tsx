import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { usePrototype } from './context'
import { buildSections, purchaseRefund } from './economy'
import { CommunityWorld, UpgradePicture } from './CommunityWorld'
import { CommunityHistory } from './CommunityHistory'
import { communityWeek } from './community-history'
import { PebbleBalance } from './Home'
import { Icon } from './ui'
import { BuildIcon, CurrencyIcon } from '../pebble-art/PixelArt'

export function PebbleGarden() {
  const { state, dispatch } = usePrototype()
  const [week, setWeek] = useState(0)
  const [selected, setSelected] = useState(6)
  const [resetVersion, setResetVersion] = useState(0)
  const [announcement, setAnnouncement] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const resetDialog = useRef<HTMLDialogElement>(null)
  const resetTrigger = useRef<HTMLButtonElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const canReset = !state.community.freshStart || state.community.owned.length > 0 || Object.keys(state.community.positions ?? {}).length > 0
  const refund = purchaseRefund(state.community)
  const cancelReset = () => { resetDialog.current?.close(); resetTrigger.current?.focus() }
  const trigger = useRef<HTMLButtonElement>(null)
  const days = communityWeek(week)
  const close = () => { dialog.current?.close(); trigger.current?.focus() }
  return <section className="pt-community-page" aria-label="Pebble community">
    <header className="pt-community-heading"><Link to="/" className="pt-icon-button pt-quiet-icon" aria-label="Back to Home" title="Back to Home"><Icon name="back" size={24} /></Link><div className="pt-community-controls"><PebbleBalance /><span className="pt-build-slot"><button ref={trigger} className="pt-icon-button pt-build-control" aria-label="Build your community" title="Build your community" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}><BuildIcon /></button></span></div></header>
    <div className="pt-community-village"><CommunityWorld key={`${week}-${selected}-${state.community.freshStart ?? false}-${resetVersion}`} freshStart={state.community.freshStart} owned={state.community.owned} positions={state.community.positions} onMove={(id, position) => dispatch({ type: 'move-community-item', id, position })} stage={days[selected].stage} />
    <CommunityHistory days={days} selected={selected} week={week} select={setSelected} changeWeek={value => { setWeek(value); setSelected(6) }} /></div>
    <dialog ref={dialog} className="pt-build-dialog" aria-labelledby="pt-upgrade-title" onCancel={event => { event.preventDefault(); close() }}>
      <header><div><h2 id="pt-upgrade-title">Build your community</h2><p className="pt-build-balance"><CurrencyIcon /><span><strong>{state.community.balance}</strong> Pebbles available</span></p></div><button ref={closeButton} className="pt-icon-button" aria-label="Close upgrades" title="Close upgrades" onClick={close}><Icon name="close" size={24} /></button></header>
      <div className="pt-upgrade-list">{buildSections.map(section => <section key={section.name} aria-label={section.name}><h3 className="pt-build-section-title">{section.name}</h3>{section.items.map(upgrade => {
        const owned = state.community.owned.includes(upgrade.id)
        const affordable = state.community.balance >= upgrade.cost
        return <article key={upgrade.id} className="pt-upgrade-item" aria-label={upgrade.name}>
          <UpgradePicture id={upgrade.id} /><div><h3>{upgrade.name}</h3><div className="pt-upgrade-purchase"><span>{upgrade.cost} Pebbles</span><button className="pt-button" disabled={owned || !affordable} aria-label={`${owned ? 'Owned' : 'Build'} ${upgrade.name}`} onClick={() => { dispatch({ type: 'build', id: upgrade.id }); setSelected(6); setAnnouncement(`${upgrade.name} built. ${upgrade.cost} Pebbles spent.`) }}>{owned ? 'Owned' : 'Build'}</button></div></div>
        </article>
      })}</section>)}</div>
      <footer className="pt-build-footer"><button ref={resetTrigger} className="pt-reset-purchases" disabled={!canReset} onClick={() => resetDialog.current?.showModal()}>Reset purchases</button></footer>
      <p className="pt-sr-only" role="status">{announcement}</p>
    </dialog>
    <dialog ref={resetDialog} className="pt-build-reset-dialog" role="alertdialog" aria-labelledby="pt-reset-purchases-title" aria-describedby="pt-reset-purchases-refund" onCancel={event => { event.preventDefault(); cancelReset() }}>
      <p id="pt-reset-purchases-title">Reset your entire Pebble Community?</p>
      <p id="pt-reset-purchases-refund">This removes all purchased items and restores your spent Pebbles. {refund} Pebbles will be returned.</p>
      <div><button className="pt-button pt-reset-cancel" onClick={cancelReset}>Cancel</button><button className="pt-button pt-reset-confirm" onClick={() => {
        dispatch({ type: 'reset-purchases' })
        setResetVersion(value => value + 1)
        setSelected(6)
        setAnnouncement(`Community reset. ${refund} Pebbles refunded.`)
        resetDialog.current?.close()
        close()
      }}>Reset everything</button></div>
    </dialog>
  </section>
}
