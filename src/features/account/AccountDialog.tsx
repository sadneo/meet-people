import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function AccountDialog({ title, close, children, busy = false }: { title: string; close: () => void; children: ReactNode; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null), id = useId()
  useEffect(() => {
    const element = ref.current!, opener = document.activeElement, overflow = document.body.style.overflow
    element.showModal(); document.body.style.overflow = 'hidden'
    element.querySelector<HTMLButtonElement>('[data-dialog-close]')?.focus()
    return () => { element.close(); document.body.style.overflow = overflow; if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true }) }
  }, [])
  return createPortal(<dialog ref={ref} className="pt-dialog account-feature-dialog" aria-labelledby={id} onCancel={event => { event.preventDefault(); if (!busy) close() }}><header><h2 id={id}>{title}</h2><button type="button" data-dialog-close aria-label="Close dialog" disabled={busy} onClick={close}>×</button></header>{children}</dialog>, document.body)
}
