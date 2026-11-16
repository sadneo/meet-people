import { useEffect, useState, type ReactNode } from 'react'
import { toastEvent, type Toast } from './feedback'

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([])
  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const show = (event: Event) => {
      const item = (event as CustomEvent<Toast>).detail
      setItems(current => [...current.slice(-1), item])
      const timer = setTimeout(() => {
        timers.delete(timer)
        setItems(current => current.filter(entry => entry.id !== item.id))
      }, 2600)
      timers.add(timer)
    }
    window.addEventListener(toastEvent, show)
    return () => { window.removeEventListener(toastEvent, show); timers.forEach(clearTimeout) }
  }, [])
  return <div className="toast-region" role="status" aria-live="polite">
    {items.map(item => <div key={item.id} className={`toast ${item.tone === 'error' ? 'is-error' : ''}`}>{item.message}</div>)}
  </div>
}

export function BusyLabel({ busy, children, busyText }: { busy: boolean; children: ReactNode; busyText?: string }) {
  return busy ? <><span className="btn-spinner" aria-hidden="true"/>{busyText ?? children}</> : <>{children}</>
}
