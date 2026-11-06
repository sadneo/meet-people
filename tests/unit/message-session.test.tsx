import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import { SessionQueryProvider } from '../../src/data/SessionQueryProvider'
import { useMessageDraft } from '../../src/data/message-drafts'

afterEach(cleanup)
it('drops all message state on session identity changes including logout and ignores late acknowledgement', async () => {
  let scope = 'me'
  const wrapper = ({ children }: { children: ReactNode }) => <SessionQueryProvider scope={scope}>{children}</SessionQueryProvider>
  const hook = renderHook(() => useMessageDraft('me:direct:chat'), { wrapper })
  const oldStore = hook.result.current.store
  act(() => { oldStore.edit('me:direct:chat', 'Hello') })
  let finish!: (message: { id: string; conversation_id: string; sender_id: string; body: string; seq: number; created_at: string }) => void
  let pending!: Promise<boolean>
  act(() => { pending = oldStore.send('me:direct:chat', 'chat', 'me', true, () => new Promise(resolve => { finish = resolve })) })
  scope = 'other'; hook.rerender()
  expect(hook.result.current.draft.body).toBe('')
  expect(oldStore.get('me:direct:chat').operation).toBeNull()
  await act(async () => { finish({ id: 'saved', conversation_id: 'chat', sender_id: 'me', body: 'Hello', seq: 1, created_at: '2026-11-05T12:00:00Z' }); await pending })
  expect(oldStore.get('me:direct:chat').confirmed).toEqual([])
  const otherStore = hook.result.current.store
  act(() => { otherStore.edit('other:direct:chat', 'Private draft') })
  scope = 'public'; hook.rerender()
  expect(otherStore.get('other:direct:chat').body).toBe('')
  scope = 'me'; hook.rerender()
  expect(hook.result.current.draft.body).toBe('')
  expect(hook.result.current.draft.operation).toBeNull()
})
