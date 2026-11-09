import { QueryClient, type Query } from '@tanstack/react-query'

const MAX_INACTIVE_READS = 24
const MAX_INACTIVE_PHOTOS = 8

export function createSessionQueryClient() {
  const client = new QueryClient({ defaultOptions: { queries: {
    retry: false, staleTime: 10_000, gcTime: 2 * 60_000,
    refetchOnWindowFocus: false,
  } } })
  // Private blob URLs live as long as their cached query, including across tabs
  // within the app. Account changes and sign-out clear and revoke the whole cache.
  const photoUrls = new Map<object, string>()
  const cache = client.getQueryCache(), recency = new Map<Query, number>()
  let clock = 0, scheduled = false
  const protectedRead = (query: Query) => {
    if (query.queryKey[0] === 'event-categories') return true
    if (query.queryKey[0] !== 'discovery-deck') return false
    const deck = query.state.data as { outcomes?: { state: string }[] } | undefined
    // Delivery uncertainty is action state, not disposable display data.
    return deck?.outcomes?.some(outcome => outcome.state === 'saving' || outcome.state === 'uncertain') ?? false
  }
  const trim = () => {
    scheduled = false
    const inactive = cache.getAll().filter(query => query.getObserversCount() === 0 && query.state.fetchStatus === 'idle' && !protectedRead(query))
      .sort((a, b) => (recency.get(a) ?? 0) - (recency.get(b) ?? 0))
    const photos = inactive.filter(query => query.queryKey[0] === 'profile-photo')
    const evicted = new Set(photos.slice(0, Math.max(0, photos.length - MAX_INACTIVE_PHOTOS)))
    const remaining = inactive.filter(query => !evicted.has(query))
    for (const query of remaining.slice(0, Math.max(0, remaining.length - MAX_INACTIVE_READS))) evicted.add(query)
    for (const query of evicted) cache.remove(query)
  }
  cache.subscribe(event => {
    if (event.type === 'removed') recency.delete(event.query)
    else if (event.type === 'observerAdded' || event.type === 'observerRemoved' || event.type === 'updated') recency.set(event.query, ++clock)
    if (event.query.queryKey[0] === 'profile-photo') {
      const value = event.query.state.data as { url?: string | null } | undefined
      const previous = photoUrls.get(event.query)
      if (previous && (event.type === 'removed' || previous !== value?.url)) { URL.revokeObjectURL(previous); photoUrls.delete(event.query) }
      if (event.type !== 'removed' && value?.url) photoUrls.set(event.query, value.url)
    }
    // Defer once per turn so newly mounted observers are attached before pruning.
    // Never cancel visible views or in-flight requests to enforce a display budget.
    if (!scheduled && (event.type === 'updated' || event.type === 'observerRemoved')) {
      scheduled = true
      queueMicrotask(trim)
    }
  })
  return client
}
