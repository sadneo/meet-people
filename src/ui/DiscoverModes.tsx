import { Link } from 'react-router'
import { Icon } from './common'
import './discover-modes.css'

type DiscoveryMode = 'Friends' | 'Dating'
type Props = {
  adult: boolean
  mode: DiscoveryMode | 'Food'
  discoverSearch?: string
  onModeChange?: (mode: DiscoveryMode) => void
  label?: string
}

export function DiscoverModes({ adult, mode, discoverSearch = '', onModeChange, label = 'Discover views' }: Props) {
  return <div className="discover-modes" role="group" aria-label={label}>
    {(['Dating', 'Friends'] as const).filter(item => item === 'Friends' || adult).map(item => {
      const params = new URLSearchParams(discoverSearch)
      params.set('mode', item.toLowerCase())
      const label = <><Icon name={item}/><span>{item}</span></>
      return onModeChange
        ? <button type="button" key={item} data-mode={item} aria-pressed={item === mode} onClick={() => onModeChange(item)}>{label}</button>
        : <Link key={item} data-mode={item} to={`/matchmaking?${params}`}>{label}</Link>
    })}
    {mode === 'Food' && <Link data-mode="Food" to="/matchmaking/food" aria-current="page"
      state={{ discoverSearch }} onClick={event => event.preventDefault()}>
      <Icon name="Food"/><span>Food</span>
    </Link>}
  </div>
}
