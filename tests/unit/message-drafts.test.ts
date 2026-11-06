import { expect, it, vi } from 'vitest'
import { createMessageDrafts } from '../../src/data/message-drafts'

const saved = { id: 'saved', conversation_id: 'chat', sender_id: 'me', body: 'Hello', seq: 1, created_at: '2026-11-05T12:00:00Z' }
it('isolates direct/group identities and keeps the exact operation through uncertain retries', async () => {
  const store = createMessageDrafts('me')
  store.edit('me:direct:chat', '  Hello  ')
  store.edit('me:group:chat', 'Group draft')
  const write = vi.fn().mockRejectedValueOnce(new Error('Lost ack')).mockResolvedValue(saved)
  await store.send('me:direct:chat', 'chat', 'me', true, write)
  const operation = store.get('me:direct:chat').operation
  store.edit('me:direct:chat', 'Do not replace uncertain text')
  await store.send('me:direct:chat', 'chat', 'me', false, write)
  expect(write).toHaveBeenCalledTimes(1)
  expect(store.get('me:group:chat').body).toBe('Group draft')
  await store.send('me:direct:chat', 'chat', 'me', true, write)
  expect(write.mock.calls[1][0]).toBe(operation)
  expect(store.get('me:direct:chat').status).toBe('confirmed')
  expect(store.get('me:direct:chat').body).toBe('')
})

it.each(['success', 'failure'])('clears sensitive state on logout/account change and ignores late %s', async result => {
  const store = createMessageDrafts('me')
  store.edit('me:direct:chat', 'Hello')
  let resolve!: (message: typeof saved) => void, reject!: (error: Error) => void
  const pending = store.send('me:direct:chat', 'chat', 'me', true, () => new Promise((yes, no) => { resolve = yes; reject = no }))
  store.clear()
  if (result === 'success') resolve(saved); else reject(new Error('Lost ack'))
  await pending
  expect(store.get('me:direct:chat')).toMatchObject({ body: '', operation: null, status: 'draft', confirmed: [], error: '' })
  const other = createMessageDrafts('other')
  other.edit('other:direct:chat', 'Hello')
  const write = vi.fn()
  await other.send('other:direct:chat', 'chat', 'me', true, write)
  expect(write).not.toHaveBeenCalled()
})
