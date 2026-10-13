import { Link } from 'react-router'
import { usePrototype } from './context'
import { Icon } from './ui'
import { CurrencyIcon } from '../pebble-art/PixelArt'
import { AvailablePeoplePreview } from './AvailablePeoplePreview'
import { demoAvailablePeople } from './available-people-preview'

export function PebbleBalance() {
  const { state } = usePrototype()
  return <span className="pt-calm-balance" aria-label="Pebble balance" title={`${state.community.balance} Pebbles`}><CurrencyIcon /><strong>{state.community.balance}</strong><span className="pt-sr-only"> Pebbles</span></span>
}

export function Home() {
  const { state, empty, setPersonId, go } = usePrototype()
  const people = empty ? [] : demoAvailablePeople(state.blocked)
  return <section className="pt-home-focus" aria-label="Find your people">
    <div className="pt-focus-toolbar"><Link className="pt-icon-button pt-quiet-icon pt-home-community" to="/community" aria-label="Community" title="Community"><Icon name="tree" size={24} /></Link><PebbleBalance /></div>
    <div className="pt-home-center">
      <AvailablePeoplePreview people={people} openProfile={person => { setPersonId(person.id); go('Other User Profile') }} />
      <h1 tabIndex={-1}>Who’s around?</h1>
      <Link className="pt-button pt-discovery-action" to="/matchmaking">Find people</Link>
      <div className="pt-focus-secondary"><Link className="pt-icon-button pt-quiet-icon" to="/downtime-matchmaking" aria-label="Downtime matchmaking" title="Downtime matchmaking"><Icon name="time" size={24} /></Link></div>
    </div>
  </section>
}
