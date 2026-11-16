import { useCallback } from 'react'
import { useCurrent } from './current'
import { useLoad } from './hooks'
import { matchingClient } from './matching-client'

export function useMatchingSetupStatus(enabled = true) {
  const token = useCurrent().session.access_token
  return useLoad(useCallback(signal => enabled ? matchingClient(token).matchingSetup(signal) : Promise.resolve(null), [enabled, token]))
}
