import { z } from 'zod'
import { authorizedRequest } from '../../auth/authorizedRequest'

// Resolves on 204. Throws ApiRequestError (with a user-safe message) otherwise.
export function deleteMyAccount() {
  return authorizedRequest('/api/account', z.null(), { method: 'DELETE', body: { confirm: 'DELETE' } })
}
