import { useCallback, useEffect, useRef } from 'react'
import { TypingResponseSchema } from '../../../shared/messaging'
import { messagingRequest } from './client'

/** Send only activity flags, at most once per two seconds while editing. */
export function useConversationTyping(id: string, isGroup: boolean, enabled: boolean, userId: string) {
  const notify = useRef<(typing: boolean) => void>(() => {})
  const pending = useRef(Promise.resolve())
  useEffect(() => {
    let active = false, lastSent = 0
    let idle: ReturnType<typeof setTimeout> | undefined
    const send = (typing: boolean) => {
      // Serialize start/stop so a slow start cannot arrive after its stop.
      pending.current = pending.current.then(() => messagingRequest(`/${encodeURIComponent(id)}/typing`, TypingResponseSchema,
        { body: { isGroup, typing }, expectedUserId: userId, signal: AbortSignal.timeout(3000) })).then(() => {}, () => {})
    }
    const stop = () => {
      if (idle !== undefined) clearTimeout(idle)
      if (active) send(false)
      active = false
    }
    notify.current = typing => {
      if (!typing || !enabled || document.visibilityState === 'hidden') { stop(); return }
      if (!active || Date.now() - lastSent >= 2000) { send(true); lastSent = Date.now() }
      active = true
      if (idle !== undefined) clearTimeout(idle)
      idle = setTimeout(stop, 2500)
    }
    const visibility = () => { if (document.visibilityState === 'hidden') stop() }
    window.addEventListener('blur', stop)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      stop()
      notify.current = () => {}
      window.removeEventListener('blur', stop)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [id, isGroup, enabled, userId])
  return useCallback((typing: boolean) => notify.current(typing), [])
}
