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

it('treats a 4xx as a definite rejection and keeps the draft editable', async () => {
  const store = createMessageDrafts('me')
  store.edit('k', 'Too spicy')
  await store.send('k', 'chat', 'me', true, () => Promise.reject(Object.assign(new Error('Nope'), { status: 400 })))
  expect(store.get('k')).toMatchObject({ body: 'Too spicy', status: 'draft', operation: null })
  expect(store.get('k').error).not.toMatch(/request ID|confirmed/i)
})

it('keeps an uncertain failure editable: editing makes a new message and discard clears it', async () => {
  const store = createMessageDrafts('me')
  store.edit('k', 'Hello')
  await store.send('k', 'chat', 'me', true, () => Promise.reject(Object.assign(new Error('boom'), { status: 500 })))
  expect(store.get('k').status).toBe('uncertain')
  expect(store.get('k').error).not.toMatch(/request ID/i)
  store.edit('k', 'Hello there')
  expect(store.get('k')).toMatchObject({ body: 'Hello there', status: 'draft', operation: null })
  await store.send('k', 'chat', 'me', true, () => Promise.reject(new Error('offline')))
  store.discard('k')
  expect(store.get('k')).toMatchObject({ body: '', status: 'draft', operation: null, error: '' })
})
