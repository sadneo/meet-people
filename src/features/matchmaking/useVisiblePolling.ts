import { useEffect } from 'react'

// Reads only. Hidden tabs do no polling; callers suppress overlapping requests.
export function useVisiblePolling(refresh: () => void | Promise<void>) {
  useEffect(() => {
    const read = () => { if (document.visibilityState !== 'hidden') void refresh() }
    read()
    const timer = window.setInterval(read, 30000)
    document.addEventListener('visibilitychange', read)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', read) }
  }, [refresh])
}
