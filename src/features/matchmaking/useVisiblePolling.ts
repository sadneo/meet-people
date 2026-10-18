import { useEffect } from 'react'

// Reads only. Hidden tabs do no polling; callers suppress overlapping requests.
// Callers that load on their own pass immediate = false, so starting or changing the
// interval does not repeat that load.
export function useVisiblePolling(refresh: () => void | Promise<void>, intervalMs = 30000, immediate = true) {
  useEffect(() => {
    const read = () => { if (document.visibilityState !== 'hidden') void refresh() }
    if (immediate) read()
    const timer = window.setInterval(read, intervalMs)
    document.addEventListener('visibilitychange', read)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', read) }
  }, [refresh, intervalMs, immediate])
}
