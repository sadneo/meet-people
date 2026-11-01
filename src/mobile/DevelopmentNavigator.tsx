import { useSession } from '../auth/useSession'
import { updateGarden } from '../features/garden/state'
import DevelopmentNavigator from '../ui/DevelopmentNavigator'

export default function MobileDevelopmentNavigator() {
  const { session } = useSession()
  return <DevelopmentNavigator product="mobile">
    {session && <button type="button" className="btn light" onClick={() => updateGarden(session.user.id, {type:'demo-funds'})}>Add 1,000 test Pebbles</button>}
  </DevelopmentNavigator>
}
