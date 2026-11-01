import { QueryClient } from '@tanstack/react-query'

export function createSessionQueryClient() {
  const client = new QueryClient({ defaultOptions: { queries: {
    retry: false, staleTime: 10_000, gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  } } })
  // Private blob URLs live as long as their cached query, including across tabs
  // within the app. Account changes and sign-out clear and revoke the whole cache.
  const photoUrls = new Map<object, string>()
  client.getQueryCache().subscribe(event => {
    if (event.query.queryKey[0] !== 'profile-photo') return
    const value = event.query.state.data as { url?: string | null } | undefined
    const previous = photoUrls.get(event.query)
    if (previous && (event.type === 'removed' || previous !== value?.url)) { URL.revokeObjectURL(previous); photoUrls.delete(event.query) }
    if (event.type !== 'removed' && value?.url) photoUrls.set(event.query, value.url)
  })
  return client
}
