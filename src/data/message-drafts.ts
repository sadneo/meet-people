import { createContext, useContext, useSyncExternalStore } from 'react'
import type { Message } from '../../shared/messaging'

type Operation = { body: string; clientRequestId: string }
type Draft = { body: string; status: 'draft' | 'pending' | 'uncertain' | 'confirmed'; operation: Operation | null; confirmed: Message[]; error: string }
const empty: Draft = { body: '', status: 'draft', operation: null, confirmed: [], error: '' }

// Memory only: no message text or request identifiers enter browser storage.
export function createMessageDrafts(scope: string) {
  const entries = new Map<string, Draft>()
  const listeners = new Set<() => void>()
  let generation = 0
  const get = (key: string) => entries.get(key) ?? empty
  const put = (key: string, value: Draft) => { entries.set(key, value); listeners.forEach(listener => listener()) }
  return {
    get,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    clear() { generation++; entries.clear(); listeners.forEach(listener => listener()) },
    edit(key: string, body: string) {
      const draft = get(key)
      // Editing an unconfirmed message makes it a new message with its own request ID.
      if (draft.status !== 'pending') put(key, { ...draft, body, operation: null, status: 'draft', error: '' })
    },
    discard(key: string) {
      const draft = get(key)
      if (draft.status !== 'pending') put(key, { ...draft, body: '', operation: null, status: 'draft', error: '' })
    },
    async send(key: string, id: string, account: string, allowed: boolean, write: (operation: Operation) => Promise<Message>) {
      const draft = get(key)
      if (account !== scope || !allowed || draft.status === 'pending' || !draft.body.trim()) return false
      const operation = draft.operation ?? { body: draft.body.trim(), clientRequestId: crypto.randomUUID() }
      const started = generation
      put(key, { ...draft, operation, status: 'pending', error: '' })
      try {
        const saved = await write(operation)
        if (started !== generation) return false
        if (saved.conversation_id !== id || saved.sender_id !== account || saved.body !== operation.body)
          throw new Error('The message response could not be confirmed. Refresh messages before retrying.')
        put(key, { body: '', operation: null, status: 'confirmed', confirmed: [...draft.confirmed, saved], error: '' })
        return true
      } catch (error) {
        if (started !== generation) return false
        // A 4xx means the server definitely rejected it, so nothing was saved and the draft stays editable.
        const status = (error as { status?: unknown }).status
        if (typeof status === 'number' && status >= 400 && status < 500 && status !== 408) put(key, { ...draft, operation: null, status: 'draft', error: 'Couldn’t send. Check your message and try again.' })
        else put(key, { ...draft, operation, status: 'uncertain', error: 'Not sent. Check your connection, then tap Retry.' })
        return false
      }
    },
  }
}

export const MessageDraftContext = createContext<ReturnType<typeof createMessageDrafts> | null>(null)
export function useMessageDraft(key: string) {
  const store = useContext(MessageDraftContext)
  if (!store) throw new Error('Message drafts require a session provider')
  const draft = useSyncExternalStore(store.subscribe, () => store.get(key))
  return { draft, store }
}
