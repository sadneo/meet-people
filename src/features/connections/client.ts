import { ConnectionListSchema, ConnectionStateSchema } from '../../../shared/connections'
import { authorizedRequest } from '../../auth/authorizedRequest'

const person = (userId: string) => `/api/connections/${encodeURIComponent(userId)}`
export const connections = {
  list: (signal?: AbortSignal) => authorizedRequest('/api/connections', ConnectionListSchema, { signal }),
  state: (userId: string, signal?: AbortSignal) => authorizedRequest(person(userId), ConnectionStateSchema, { signal }),
  // Accepts instead when this person already asked.
  request: (userId: string) => authorizedRequest(person(userId), ConnectionStateSchema, { body: {} }),
  accept: (userId: string) => authorizedRequest(`${person(userId)}/accept`, ConnectionStateSchema, { body: {} }),
  remove: (userId: string) => authorizedRequest(person(userId), ConnectionStateSchema, { method: 'DELETE' }),
}
