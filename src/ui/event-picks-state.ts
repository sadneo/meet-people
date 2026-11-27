// When the event-picks tray shows in a direct chat. It steps aside as the
// conversation gets going and never comes back on its own once hidden.
export const PICKS_COLLAPSE_EACH = 2
export const PICKS_HIDE_TOTAL = 20
export const PICKS_HIDE_AFTER_MS = 3 * 24 * 60 * 60 * 1000

export type EventPicksView = 'open' | 'chip' | 'hidden'
export function eventPicksView(input: {
  remaining: number
  messages: readonly { sender_id: string | null; created_at: string }[]
  me: string
  sentPick: boolean
  dismissed: boolean
  peek: boolean
  now: number
}): EventPicksView {
  if (!input.remaining) return 'hidden'
  if (input.peek) return 'open'
  if (input.dismissed || input.messages.length >= PICKS_HIDE_TOTAL) return 'hidden'
  const first = Date.parse(input.messages[0]?.created_at ?? '')
  if (Number.isFinite(first) && input.now - first > PICKS_HIDE_AFTER_MS) return 'hidden'
  if (input.sentPick) return 'chip'
  const mine = input.messages.filter(message => message.sender_id === input.me).length
  const theirs = input.messages.filter(message => message.sender_id !== null && message.sender_id !== input.me).length
  return mine >= PICKS_COLLAPSE_EACH && theirs >= PICKS_COLLAPSE_EACH ? 'chip' : 'open'
}

// Hiding the tray is a device-local display choice per account and chat.
const dismissedKey = (userId: string, conversationId: string) => `pebble:event-picks-hidden:${userId}:${conversationId}`
export function picksDismissed(userId: string, conversationId: string) {
  try { return window.localStorage.getItem(dismissedKey(userId, conversationId)) === '1' } catch { return false }
}
export function setPicksDismissed(userId: string, conversationId: string, dismissed: boolean) {
  try {
    if (dismissed) window.localStorage.setItem(dismissedKey(userId, conversationId), '1')
    else window.localStorage.removeItem(dismissedKey(userId, conversationId))
  } catch { /* Storage can be unavailable; the choice then lasts for this visit. */ }
}
