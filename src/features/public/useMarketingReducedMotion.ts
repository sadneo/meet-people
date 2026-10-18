import { useSyncExternalStore } from 'react'

const motionQuery = '(prefers-reduced-motion: reduce)'
const subscribe = (callback: () => void) => {
  const query = window.matchMedia?.(motionQuery)
  query?.addEventListener('change', callback)
  return () => query?.removeEventListener('change', callback)
}

export function useMarketingReducedMotion() {
  return useSyncExternalStore(subscribe, () => window.matchMedia?.(motionQuery).matches ?? true, () => true)
}
