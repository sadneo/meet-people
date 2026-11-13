import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi, type Mock } from 'vitest'
import type { ReactNode } from 'react'
import { createSessionQueryClient } from '../../src/data/query-client'
import { useCachedLoad } from '../../src/data/useCachedLoad'

const clients: ReturnType<typeof createSessionQueryClient>[] = []
function setup() {
  const client = createSessionQueryClient(); clients.push(client)
  return { client, wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }
}
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.restoreAllMocks() })

it('deduplicates simultaneous reads of the same account-scoped query', async () => {
  const { wrapper } = setup()
  let finish!: (value: string) => void
  const load = vi.fn(() => new Promise<string>(resolve => { finish = resolve }))
  const hook = renderHook(() => [useCachedLoad(load, ['shared']), useCachedLoad(load, ['shared'])], { wrapper })
  await waitFor(() => expect(load).toHaveBeenCalledOnce())
  await act(async () => { finish('confirmed') })
  await waitFor(() => expect(hook.result.current.every(result => result.value === 'confirmed')).toBe(true))
})

it('shows cached data immediately on revisit while a fresh read is pending', async () => {
  const { wrapper } = setup()
  const first = renderHook(() => useCachedLoad(async () => 'previous', ['events'], 0), { wrapper })
  await waitFor(() => expect(first.result.current.value).toBe('previous')); first.unmount()
  let finish!: (value: string) => void
  const second = renderHook(() => useCachedLoad(() => new Promise<string>(resolve => { finish = resolve }), ['events'], 0), { wrapper })
  expect(second.result.current.value).toBe('previous')
  expect(second.result.current.loading).toBe(false)
  expect(second.result.current.refreshing).toBe(true)
  await act(async () => { finish('updated') })
  await waitFor(() => expect(second.result.current.value).toBe('updated'))
})

it('never shows the previous filter or another cache scope as the requested result', async () => {
  const first = setup(), second = setup()
  first.client.setQueryData(['events', 'Music'], 'music')
  const pending = () => new Promise<string>(() => {})
  const a = renderHook(({ category }) => useCachedLoad(pending, ['events', category]), { wrapper: first.wrapper, initialProps: { category: 'Music' } })
  expect(a.result.current.value).toBe('music')
  a.rerender({ category: 'Food' }); expect(a.result.current.value).toBeNull()
  const b = renderHook(() => useCachedLoad(pending, ['events', 'Music']), { wrapper: second.wrapper })
  expect(b.result.current.value).toBeNull()
})

it('clearing the session cancels old reads and revokes cached private image URLs', async () => {
  const { client } = setup()
  const revoke = vi.fn()
  vi.stubGlobal('URL', class extends URL { static revokeObjectURL = revoke })
  let signal!: AbortSignal, finish!: (value: string) => void
  const pending = client.fetchQuery({ queryKey: ['private'], queryFn: context => {
    signal = context.signal
    return new Promise<string>(resolve => { finish = resolve })
  } }).catch(() => undefined)
  client.setQueryData(['profile-photo', 'owner'], { url: 'blob:private-one' })
  client.setQueryData(['profile-photo', 'owner'], { url: 'blob:private-two' })
  expect(revoke).toHaveBeenCalledWith('blob:private-one')
  client.clear()
  expect(signal.aborted).toBe(true)
  expect(revoke).toHaveBeenCalledWith('blob:private-two')
  finish('old account data'); await pending
  expect(client.getQueryData(['private'])).toBeUndefined()
  vi.unstubAllGlobals()
})

it('invalidating confirmed changes refreshes an active view without blanking it', async () => {
  const { client, wrapper } = setup()
  let finish!: (value: string) => void
  const load: Mock<() => Promise<string>> = vi.fn().mockResolvedValueOnce('before').mockImplementation(() => new Promise<string>(resolve => { finish = resolve }))
  const hook = renderHook(() => useCachedLoad(load, ['inbox']), { wrapper })
  await waitFor(() => expect(hook.result.current.value).toBe('before'))
  let refreshed!: Promise<void>
  act(() => { refreshed = client.invalidateQueries({ queryKey: ['inbox'] }) })
  expect(hook.result.current.value).toBe('before')
  await act(async () => { finish('after'); await refreshed })
  await waitFor(() => expect(hook.result.current.value).toBe('after'))
})

it('bounds inactive display entries while keeping recently observed data', async () => {
  const { client, wrapper } = setup()
  client.setQueryData(['keep-recent'], 'recent')
  for (let index = 0; index < 30; index++) client.setQueryData(['page', index], index)
  const hook = renderHook(() => useCachedLoad(async () => 'recent', ['keep-recent']), { wrapper })
  hook.unmount()
  await waitFor(() => expect(client.getQueryCache().getAll().length).toBeLessThanOrEqual(24))
  expect(client.getQueryData(['keep-recent'])).toBe('recent')
  expect(client.getQueryData(['page', 0])).toBeUndefined()
})

it('limits inactive private photos and revokes the evicted URLs', async () => {
  const { client } = setup()
  const revoke = vi.fn()
  vi.stubGlobal('URL', class extends URL { static revokeObjectURL = revoke })
  try {
    for (let index = 0; index < 12; index++) client.setQueryData(['profile-photo', index], { url: `blob:person-${index}` })
    await waitFor(() => expect(client.getQueryCache().findAll({ queryKey: ['profile-photo'] })).toHaveLength(8))
    expect(revoke).toHaveBeenCalledWith('blob:person-0')
    expect(revoke).not.toHaveBeenCalledWith('blob:person-11')
    client.clear()
    expect(revoke).toHaveBeenCalledWith('blob:person-11')
  } finally { vi.unstubAllGlobals() }
})

it('releases unused display data after two minutes instead of persisting it', async () => {
  vi.useFakeTimers()
  const { client } = setup()
  try {
    client.setQueryData(['temporary'], 'display only')
    await vi.advanceTimersByTimeAsync(120_001)
    expect(client.getQueryData(['temporary'])).toBeUndefined()
  } finally { client.clear(); vi.useRealTimers() }
})

it('never evicts an observed view, an in-flight read, or unresolved discovery actions', async () => {
  const { client, wrapper } = setup()
  const active = renderHook(() => useCachedLoad(async () => 'visible', ['visible']), { wrapper })
  await waitFor(() => expect(active.result.current.value).toBe('visible'))
  let finish!: (value: string) => void
  const pending = client.fetchQuery({ queryKey: ['pending'], queryFn: () => new Promise<string>(resolve => { finish = resolve }) })
  client.setQueryData(['discovery-deck', 'Friends'], { outcomes: [{ state: 'uncertain' }] })
  client.setQueryData(['event-categories'], ['A previously loaded category'])
  for (let index = 0; index < 40; index++) client.setQueryData(['unused', index], index)
  await Promise.resolve()
  expect(client.getQueryData(['visible'])).toBe('visible')
  expect(client.getQueryState(['pending'])?.fetchStatus).toBe('fetching')
  expect(client.getQueryData(['discovery-deck', 'Friends'])).toEqual({ outcomes: [{ state: 'uncertain' }] })
  expect(client.getQueryData(['event-categories'])).toEqual(['A previously loaded category'])
  finish('finished'); await pending
})
