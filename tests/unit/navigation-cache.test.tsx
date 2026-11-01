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
