import { useCallback, useEffect, useRef, useState } from 'react'
import { MessagingActivitySchema } from '../../../shared/messaging'
import { useSession } from '../../auth/useSession'
import { useVisiblePolling } from '../matchmaking/useVisiblePolling'
import { messagingRequest } from './client'

const changed = 'pebble:messages-activity'
// Call after reading a chat or answering a request so the dot clears promptly.
export function announceMessagesActivity() { window.dispatchEvent(new Event(changed)) }

// True while there are unread conversations or connection requests waiting.
export function useMessagesActivity() {
  const { session } = useSession()
  const userId = session?.user.id
  const [active, setActive] = useState(false)
  const pending = useRef(false)
  const refresh = useCallback(async () => {
    if (!userId || pending.current) return
    pending.current = true
    try {
      const data = await messagingRequest('/activity', MessagingActivitySchema)
      setActive(data.unreadConversations + data.incomingRequests > 0)
    } catch { /* Keep the last known state; the next poll tries again. */ }
    finally { pending.current = false }
  }, [userId])
  useVisiblePolling(refresh)
  useEffect(() => {
    const read = () => { void refresh() }
    window.addEventListener(changed, read)
    return () => window.removeEventListener(changed, read)
  }, [refresh])
  return Boolean(userId) && active
}
