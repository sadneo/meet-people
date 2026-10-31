import { useEffect, useState, type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createSessionQueryClient } from './query-client'

export function SessionQueryProvider({ children, scope }: { children: ReactNode; scope: string }) {
  const [client] = useState(createSessionQueryClient)
  useEffect(() => {
    const activity = () => { void client.invalidateQueries({ predicate: query => ['inbox', 'groups', 'activity', 'connections'].includes(String(query.queryKey[0])) }) }
    const matching = () => {
      client.removeQueries({ queryKey: ['discovery-deck'] })
      void client.invalidateQueries({ predicate: query => !['events', 'event', 'discovery-deck'].includes(String(query.queryKey[0])) })
    }
    const photo = (event: Event) => {
      if (event instanceof CustomEvent) void client.invalidateQueries({ queryKey: ['profile-photo', event.detail] })
    }
    window.addEventListener('pebble:activity-changed', activity)
    window.addEventListener('pebble:matching-changed', matching)
    window.addEventListener('pebble:profile-photo-changed', photo)
    return () => {
      window.removeEventListener('pebble:activity-changed', activity)
      window.removeEventListener('pebble:matching-changed', matching)
      window.removeEventListener('pebble:profile-photo-changed', photo)
      client.clear()
    }
  // Clear between identities without remounting the in-progress sign-in form.
  // Private's account loader separately gates and remounts on each account ID.
  }, [client, scope])
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
