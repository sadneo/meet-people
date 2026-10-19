import { useCallback, useEffect, useRef, useState } from 'react'
import { MessagingActivitySchema } from '../../../shared/messaging'
import { useSession } from '../../auth/useSession'
import { useVisiblePolling } from '../matchmaking/useVisiblePolling'
import { messagingRequest } from './client'

const changed = 'pebble:messages-activity'
// Call after reading a chat or answering a request so the dot clears promptly.
export function announceMessagesActivity() { window.dispatchEvent(new Event(changed)) }

// True while there are unread conversations or connection requests waiting.
export function useMessagesActivity(enabled = true) {
  const { session } = useSession()
  const userId = session?.user.id
  const [activity, setActivity] = useState<{ userId: string; active: boolean } | null>(null)
  const pending = useRef<AbortController | null>(null)
  const refresh = useCallback(async () => {
    if (!enabled || !userId || pending.current) return
    const controller = new AbortController()
    pending.current = controller
    try {
      const data = await messagingRequest('/activity', MessagingActivitySchema, { signal: controller.signal })
      if (!controller.signal.aborted) setActivity({ userId, active: data.unreadConversations + data.incomingRequests > 0 })
    } catch { /* Keep the last known state; the next poll tries again. */ }
    finally { if (pending.current === controller) pending.current = null }
  }, [enabled, userId])
  useEffect(() => () => { pending.current?.abort(); pending.current = null }, [enabled, userId])
  useVisiblePolling(refresh, 30000, true, enabled && !!userId)
  useEffect(() => {
    if (!enabled || !userId) return
    const read = () => { void refresh() }
    window.addEventListener(changed, read)
    return () => window.removeEventListener(changed, read)
  }, [enabled, userId, refresh])
  return enabled && !!userId && activity?.userId === userId && activity.active
}
