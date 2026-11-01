import type { QueryClient } from '@tanstack/react-query'
import { EventsResponseSchema } from '../../shared/events'
import { ConversationsSchema, MessagingActivitySchema } from '../../shared/messaging'
import { eventRequest } from '../features/events/client'
import { messagingRequest } from '../features/messaging/client'
import { matchingClient } from '../ui/matching-client'

/** These reads only warm list data; they never join queues, activate discovery,
 * mark messages read, or preflight a mutation. */
export function prefetchNavigation(client: QueryClient, path: string, token: string) {
  if (path === '/events') void client.prefetchQuery({ queryKey: ['events', '', 1], staleTime: 30_000,
    queryFn: ({ signal }) => eventRequest('?page=1&limit=12', EventsResponseSchema, { signal }) })
  if (path === '/messages') {
    void client.prefetchQuery({ queryKey: ['inbox', 1], staleTime: 5000, queryFn: ({ signal }) => messagingRequest('?page=1', ConversationsSchema, { signal }) })
    void client.prefetchQuery({ queryKey: ['groups'], staleTime: 5000, queryFn: ({ signal }) => matchingClient(token).groups(signal) })
    void client.prefetchQuery({ queryKey: ['activity'], staleTime: 2000, queryFn: ({ signal }) => messagingRequest('/activity', MessagingActivitySchema, { signal }) })
  }
}
