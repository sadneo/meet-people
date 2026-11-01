import { useCallback } from 'react'
import { useQuery, type QueryKey } from '@tanstack/react-query'

/** Only opt-in display reads use this cache. Writes and their canonical readbacks
 * continue to call the API directly. Keys include all request parameters. */
export function useCachedLoad<T>(load: (signal: AbortSignal) => Promise<T>, key: QueryKey, staleTime = 10_000) {
  const query = useQuery({ queryKey: key, queryFn: ({ signal }) => load(signal), staleTime })
  const { refetch } = query
  const reload = useCallback(() => { void refetch() }, [refetch])
  return {
    value: query.isError ? null : query.data ?? null,
    error: query.error instanceof Error ? query.error.message : query.isError ? 'This service is unavailable. Try again.' : '',
    loading: query.isPending,
    refreshing: query.isFetching,
    reload,
  }
}
