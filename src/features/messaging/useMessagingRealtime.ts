import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../../supabase'
import { TypingEventSchema, type TypingEvent } from '../../../shared/messaging'

const messagingKeys = new Set(['inbox', 'groups', 'activity', 'message-history', 'connections'])
// The SDK reuses channels with the same topic. Await the previous leave before
// rejoining, including rapid navigation, explicit reconnect and Strict Mode.
let channelRemoval: Promise<unknown> = Promise.resolve()

/** Change broadcasts refresh display reads; typing flags expire in memory.
 * The API still owns permissions, content, read acknowledgements and sends. */
export function useMessagingRealtime(userId: string) {
  const client = useQueryClient()
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [typing, setTyping] = useState<{ owner: string; peers: (TypingEvent & { expires: number })[] }>({ owner: userId, peers: [] })
  useEffect(() => {
    if (!typing.peers.length) return
    const timer = setTimeout(() => setTyping(value => ({ ...value, peers: value.peers.filter(peer => peer.expires > Date.now()) })),
      Math.max(0, Math.min(...typing.peers.map(peer => peer.expires)) - Date.now()))
    return () => clearTimeout(timer)
  }, [typing])
  const reconnect = useCallback(() => setAttempt(value => value + 1), [])
  useEffect(() => {
    if (!supabase) return
    const sdk = supabase
    let active = true, dirty = false, running = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const visible = () => document.visibilityState !== 'hidden'
    const filters = { predicate: (query: { queryKey: readonly unknown[] }) => messagingKeys.has(String(query.queryKey[0])) }

    const flush = async () => {
      if (!active || running || !visible()) return
      running = true
      try {
        while (active && dirty && visible()) {
          dirty = false
          // An event can arrive during the initial history read. Wait for that
          // read, then fetch again so its older snapshot cannot swallow the event.
          await Promise.allSettled(client.getQueryCache().findAll(filters).map(query => query.promise))
          if (!active) return
          if (!visible()) { dirty = true; return }
          await client.invalidateQueries(filters, { cancelRefetch: false })
        }
      } finally { running = false }
    }
    const refresh = () => {
      dirty = true
      if (!active || running || timer !== undefined) return
      // A send also updates its sender's read sequence; combine that burst.
      timer = setTimeout(() => { timer = undefined; void flush() }, 30)
    }
    const foreground = () => {
      setTyping(value => ({ owner: userId, peers: visible() && value.owner === userId ? value.peers.filter(peer => peer.expires > Date.now()) : [] }))
      if (visible()) refresh()
    }
    let channel: RealtimeChannel | undefined
    void channelRemoval.then(() => {
      if (!active) return
      channel = sdk.channel(`messaging:${userId}`, { config: { private: true } })
      .on('broadcast', { event: 'changed' }, refresh)
      .on('broadcast', { event: 'typing' }, ({ payload }: { payload: unknown }) => {
        if (!active || !visible()) return
        const parsed = TypingEventSchema.safeParse(payload)
        if (!parsed.success || parsed.data.userId === userId) return
        const event = parsed.data
        setTyping(value => {
          const peers = (value.owner === userId ? value.peers : []).filter(peer => peer.expires > Date.now() &&
            !(peer.conversationId === event.conversationId && peer.isGroup === event.isGroup && peer.userId === event.userId))
          return { owner: userId, peers: event.typing ? [...peers.slice(-63), { ...event, expires: Date.now() + 5000 }] : peers }
        })
      })
      .subscribe(status => {
        if (!active) return
        if (status === 'SUBSCRIBED') {
          setError('')
          // Also closes the read/subscribe gap and catches up after reconnects.
          refresh()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setError('Live updates are unavailable.')
          setTyping({ owner: userId, peers: [] })
        }
      })
    }).catch(() => { if (active) setError('Live updates are unavailable.') })
    window.addEventListener('focus', foreground)
    window.addEventListener('online', foreground)
    document.addEventListener('visibilitychange', foreground)
    return () => {
      active = false
      if (timer !== undefined) clearTimeout(timer)
      window.removeEventListener('focus', foreground)
      window.removeEventListener('online', foreground)
      document.removeEventListener('visibilitychange', foreground)
      if (channel) channelRemoval = sdk.removeChannel(channel).catch(() => undefined)
    }
  }, [client, userId, attempt])
  return { error, reconnect, typing: typing.owner === userId ? typing.peers : [] }
}
