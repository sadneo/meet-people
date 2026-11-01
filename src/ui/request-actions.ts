import type { ConnectionRequest } from '../../shared/connections'
import { connections } from '../features/connections/client'
import { matchingClient } from './matching-client'

export async function respondToConnectionRequest(token: string, person: Pick<ConnectionRequest, 'id' | 'mode'>, accept: boolean) {
  const result = !accept ? await connections.remove(person.id)
    : person.mode === 'dating' ? await matchingClient(token).connect('Dating', person.id)
    : person.mode === 'friends' ? await matchingClient(token).acceptFriend(person.id)
    : await connections.accept(person.id)
  if (accept ? result.status !== 'connected' : result.status !== 'none') throw new Error('The request response could not be confirmed.')
  return result
}
