import { DiningResponseSchema } from '../../../shared/dining'
import { authorizedRequest } from '../../auth/authorizedRequest'

export async function readDiningMenus(date: string, signal: AbortSignal) {
  try {
    return await authorizedRequest(`/api/dining?${new URLSearchParams({ date })}`, DiningResponseSchema, { signal })
  } catch (error) {
    if (signal.aborted) throw error
    throw new Error('Food menus couldn’t be loaded. Try again in a moment.', { cause: error })
  }
}
