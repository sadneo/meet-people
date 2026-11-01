import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DatingCandidate } from '../../shared/dating-live'
import type { FriendsDiscoveryCandidate } from '../../shared/friends-discovery'
import type { ConnectionState } from '../../shared/connections'
import { matchingClient, MatchingError } from './matching-client'
import { useQueryClient } from '@tanstack/react-query'
export type DiscoveryPerson = DatingCandidate | FriendsDiscoveryCandidate
type Outcome = { person: DiscoveryPerson; state: 'saving' | 'uncertain' | 'rejected' | 'confirmed'; result?: ConnectionState; error?: string }
type DeckSnapshot = { cards: DiscoveryPerson[]; outcomes: Outcome[]; skipped: DiscoveryPerson | null; excluded: string[]; searched: boolean }
export function useDiscoveryDeck(token: string, mode: 'Friends' | 'Dating', enabled: boolean, revision: string) {
  const cache = useQueryClient(), key = useMemo(() => ['discovery-deck', mode, revision], [mode, revision])
  const cached = useMemo(() => {
    const saved = cache.getQueryState<DeckSnapshot>(key)
    return saved && Date.now() - saved.dataUpdatedAt < 30_000 ? saved.data : undefined
  }, [cache, key])
  const [ownerKey, setOwnerKey] = useState(key)
  const client = useMemo(() => matchingClient(token), [token])
  const [cards, setCards] = useState<DiscoveryPerson[]>(cached?.cards ?? []), [loading, setLoading] = useState(false), [error, setError] = useState(''), [searched, setSearched] = useState(cached?.searched ?? false)
  const [errorCode, setErrorCode] = useState('')
  const [outcomes, setOutcomes] = useState<Outcome[]>(cached?.outcomes.map(item => item.state === 'saving' ? { ...item, state: 'uncertain' as const, error: 'Check Connections before sending again.' } : item) ?? [])
  const [skipped, setSkipped] = useState<DiscoveryPerson | null>(cached?.skipped ?? null)
  const outcomesRef = useRef(outcomes); outcomesRef.current = outcomes
  const writes = useRef(new Set<string>())
  const excluded = useRef(new Set<string>(cached?.excluded)), inFlight = useRef(false), generation = useRef(0), controller = useRef<AbortController | null>(null), live = useRef(true)
  // Invalidate the latest request generation on unmount; this is not a DOM ref.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { live.current = true; return () => { live.current = false; generation.current++; controller.current?.abort() } }, [])
  const fill = useCallback(async () => {
    if (!enabled || inFlight.current || !live.current) return
    const maximum = mode === 'Dating' ? 50 : 200
    if (excluded.current.size >= maximum) return
    const epoch = generation.current, abort = new AbortController(); controller.current = abort; inFlight.current = true; setLoading(true); setError(''); setErrorCode('')
    try {
      const result = await client[mode === 'Friends' ? 'friends' : 'dating']([...excluded.current], abort.signal)
      if (!live.current || abort.signal.aborted || epoch !== generation.current) return
      const seen = excluded.current
      const next = result.candidates.filter(person => !seen.has(person.id))
      next.forEach(person => seen.add(person.id))
      setCards(current => [...current, ...next]); setSearched(true)
    } catch (failure) {
      if (live.current && !abort.signal.aborted && epoch === generation.current) {
        setError(failure instanceof Error ? failure.message : 'Recommendations are unavailable. Try again.')
        setErrorCode(failure instanceof MatchingError ? failure.code ?? '' : '')
      }
    } finally {
      if (live.current && epoch === generation.current) { inFlight.current = false; setLoading(false) }
    }
  }, [client, enabled, mode])
  const reset = useCallback(() => {
    cache.removeQueries({ queryKey: key, exact: true }); setOwnerKey(key)
    generation.current++; controller.current?.abort(); inFlight.current = false; excluded.current = new Set(); setCards([]); setSkipped(null); setSearched(false); setError(''); setErrorCode(''); setLoading(false)
    // Keep uncertain action feedback across preference and discovery refreshes.
    for (const outcome of outcomesRef.current) if (outcome.state !== 'confirmed') excluded.current.add(outcome.person.id)
    void fill()
  }, [fill, cache, key])
  useEffect(() => {
    if (enabled && cached) {
      generation.current++; controller.current?.abort(); inFlight.current = false
      excluded.current = new Set(cached.excluded); setOwnerKey(key); setCards(cached.cards); setSkipped(cached.skipped); setSearched(cached.searched); setLoading(false); setError('')
    } else reset()
  }, [reset, enabled, cached, key])
  useEffect(() => {
    if (enabled && ownerKey === key && (searched || outcomes.length)) cache.setQueryData<DeckSnapshot>(key, { cards, outcomes, skipped, excluded: [...excluded.current], searched })
  }, [cache, key, ownerKey, enabled, cards, outcomes, skipped, searched])
  useEffect(() => { const changed = () => reset(); window.addEventListener('pebble:matching-changed', changed); return () => window.removeEventListener('pebble:matching-changed', changed) }, [reset])
  function advance(person: DiscoveryPerson, remember = true) {
    setSkipped(remember ? person : null)
    setCards(current => { const next = current.filter(card => card.id !== person.id); return next })
  }
  function undo() {
    if (!skipped) return
    setCards(current => [skipped, ...current.filter(person => person.id !== skipped.id)])
    setSkipped(null)
  }
  // Refill once at the threshold; an exhausted/error result does not cause a loop.
  const size = cards.length, lastSize = useRef(-1)
  useEffect(() => {
    if (size <= 3 && size < lastSize.current) void fill()
    lastSize.current = size
  }, [size, fill])
  async function connect(person: DiscoveryPerson) {
    if (writes.current.has(person.id)) return
    if (outcomesRef.current.some(item => item.person.id === person.id && item.state !== 'confirmed')) return
    writes.current.add(person.id)
    advance(person, false); setOutcomes(current => [...current.filter(item => item.person.id !== person.id), { person, state: 'saving' }])
    try {
      const result = await client.connect(mode, person.id)
      if (!live.current) return
      cache.removeQueries({ queryKey: ['discovery-deck'] })
      setOutcomes(current => current.map(item => item.person.id === person.id ? { person, state: 'confirmed', result } : item))
      window.dispatchEvent(new Event('pebble:activity-changed'))
    } catch (failure) {
      // Only request_limit confirms rejection before saving; interrupted writes/readbacks
      // still require reconciliation and must never be silently retried.
      const rejected = failure instanceof MatchingError && failure.status === 429 && failure.code === 'request_limit'
      if (live.current) setOutcomes(current => current.map(item => item.person.id === person.id ? { person, state: rejected ? 'rejected' : 'uncertain', error: failure instanceof Error ? failure.message : 'Request could not be confirmed.' } : item))
      return rejected
    }
  }
  return { cards: ownerKey === key ? cards : [], loading: loading || enabled && (!searched && !error || ownerKey !== key), error, errorCode, searched, advance, connect, outcomes, refill: fill, reset, undo, canUndo: skipped !== null }
}
