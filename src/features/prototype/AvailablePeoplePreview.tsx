import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Icon } from './ui'
import { HomeIdlePebble } from './HomeIdlePebble'
import { previewPeople, type AvailablePerson } from './available-people-preview'
import './home-preview.css'

// Content-density exception only; shell navigation still switches at 800px.
const narrowPhoneQuery = '(max-width: 520px)'
function subscribeToNarrowPhone(callback: () => void) {
  if (!window.matchMedia) return () => {}
  const query = window.matchMedia(narrowPhoneQuery)
  query.addEventListener('change', callback)
  return () => query.removeEventListener('change', callback)
}

function AvailablePersonBubble({ person, slot, thinking, open }: { person: AvailablePerson; slot: number; thinking: boolean; open: (person: AvailablePerson) => void }) {
  return <button type="button" className={`pt-thought-bubble pt-thought-${slot}`} aria-label={`View ${person.name}'s profile`} title={`View ${person.name}'s profile`} disabled={thinking} tabIndex={thinking ? -1 : 0} onClick={() => open(person)}>
    {person.avatar ? <img src={person.avatar} alt="" /> : <span className="pt-thought-fallback"><Icon name="profile" /></span>}
    <i className="pt-thought-available" aria-hidden="true" /><span className="pt-thought-name">{person.name.trim().split(/\s+/)[0]}</span>
  </button>
}

export function AvailablePeoplePreview({ people, openProfile, refreshPeople }: { people: readonly AvailablePerson[]; openProfile: (person: AvailablePerson) => void; refreshPeople?: (signal: AbortSignal) => Promise<void> }) {
  const narrowPhone = useSyncExternalStore(subscribeToNarrowPhone, () => window.matchMedia?.(narrowPhoneQuery).matches ?? false, () => false)
  const count = narrowPhone ? 2 : 3
  const [start, setStart] = useState(0)
  const [thinking, setThinking] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const request = useRef<AbortController | null>(null)
  const visible = previewPeople(people, start, count)

  useEffect(() => () => { request.current?.abort(); if (timer.current !== null) clearTimeout(timer.current) }, [])

  async function refresh() {
    // Guard immediately, including clicks arriving before React paints disabled.
    if (request.current !== null) return
    const controller = new AbortController()
    request.current = controller
    setThinking(true)
    setAnnouncement('Looking around…')
    const next = start + visible.length
    // Start the visual minimum and optional data refresh together. Home currently
    // uses local previews; a future adapter can supply loading without a second wait.
    const [, loading] = await Promise.allSettled([
      new Promise<void>(resolve => { timer.current = setTimeout(resolve, 1750) }),
      Promise.resolve().then(() => refreshPeople?.(controller.signal)),
    ])
    if (controller.signal.aborted) return
    if (loading.status === 'fulfilled') setStart(next)
    setThinking(false)
    setAnnouncement(loading.status === 'rejected' ? 'Could not refresh people. Try again.' : people.length ? 'People refreshed.' : 'No people to show right now.')
    timer.current = null
    request.current = null
  }

  return <div className={`pt-available-preview pt-mascot-scene ${thinking ? 'is-thinking' : ''}`}>
    <div className="pt-thoughts" aria-label="People around you" aria-busy={thinking} aria-hidden={thinking} inert={thinking ? true : undefined}>
      {visible.map((person, index) => <AvailablePersonBubble key={person.id} person={person} slot={index} thinking={thinking} open={openProfile} />)}
    </div>
    <button type="button" className="pt-pebble-refresh" aria-label="Refresh people who are available now" title="Refresh people who are available now" aria-disabled={thinking} onClick={refresh}>
      <HomeIdlePebble thinking={thinking} />
    </button>
    <p className="pt-sr-only" role="status">{announcement}</p>
  </div>
}
