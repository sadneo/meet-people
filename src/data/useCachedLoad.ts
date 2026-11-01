import { useCallback } from 'react'
import { useQuery, type QueryKey } from '@tanstack/react-query'

/** Only opt-in display reads use this cache. Writes and their canonical readbacks
 * continue to call the API directly. Keys include all request parameters. */
type DisplayReadOptions = {
  refetchInterval?: number | false
  refetchOnWindowFocus?: boolean | 'always'
  retainDataOnError?: boolean
}

export function useCachedLoad<T>(load: (signal: AbortSignal) => Promise<T>, key: QueryKey, staleTime = 10_000, options: DisplayReadOptions = {}) {
  const query = useQuery({
    queryKey: key, queryFn: ({ signal }) => load(signal), staleTime,
    refetchInterval: options.refetchInterval,
    refetchIntervalInBackground: false,
    ...(options.refetchOnWindowFocus === undefined ? {} : { refetchOnWindowFocus: options.refetchOnWindowFocus }),
  })
  const { refetch } = query
  const reload = useCallback(() => { void refetch() }, [refetch])
  return {
    // Retained data is for display only; callers must still gate writes on error/refreshing.
    value: query.isError && !options.retainDataOnError ? null : query.data ?? null,
    error: query.error instanceof Error ? query.error.message : query.isError ? 'This service is unavailable. Try again.' : '',
    loading: query.isPending,
    refreshing: query.isFetching,
    updatedAt: query.dataUpdatedAt,
    reload,
  }
}
