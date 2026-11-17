import { Link } from 'react-router'
import { Icon } from './common'
import './discover-modes.css'

type DiscoveryMode = 'Friends' | 'Dating'
type Props = {
  adult: boolean
  mode: DiscoveryMode | 'Food'
  discoverSearch?: string
  onModeChange?: (mode: DiscoveryMode) => void
  // The profile preview reuses this switch for Friends and Dating only.
  showFood?: boolean
  label?: string
}

export function DiscoverModes({ adult, mode, discoverSearch = '', onModeChange, showFood = true, label = 'Discover views' }: Props) {
  return <div className="discover-modes" role="group" aria-label={label}>
    {(['Friends', 'Dating'] as const).filter(item => item === 'Friends' || adult).map(item => {
      const params = new URLSearchParams(discoverSearch)
      params.set('mode', item.toLowerCase())
      const label = <><Icon name={item}/><span>{item}</span></>
      return onModeChange
        ? <button type="button" key={item} data-mode={item} aria-pressed={item === mode} onClick={() => onModeChange(item)}>{label}</button>
        : <Link key={item} data-mode={item} to={`/matchmaking?${params}`}>{label}</Link>
    })}
    {showFood && <Link data-mode="Food" to="/matchmaking/food" aria-current={mode === 'Food' ? 'page' : undefined}
      state={{ discoverSearch }} onClick={mode === 'Food' ? event => event.preventDefault() : undefined}>
      <Icon name="Food"/><span>Food</span>
    </Link>}
  </div>
}
