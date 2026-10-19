import { useEffect, useId, useRef, useState } from 'react'
import type { MatchingProfile } from '../../../shared/matchmaking'

const catalog = ['Coffee', 'Art', 'Music', 'Outdoors', 'Food', 'Gaming', 'Photography', 'Movies', 'Fitness', 'Study', 'Sports']
const interestArt: Record<string, string> = {
  Coffee: 'M5 7h11v7a5 5 0 0 1-10 0V7m10 1h2a3 3 0 0 1 0 6h-2M4 21h15M8 3v1m4-1v1',
  Art: 'm12 3 9 9-9 9-9-9 9-9Zm0 5 4 4-4 4-4-4 4-4Z',
  Music: 'M9 18V5l11-2v13M9 8l11-2M9 18c0 4-6 4-6 1s6-4 6-1Zm11-2c0 4-6 4-6 1s6-4 6-1Z',
  Outdoors: 'm12 2-5 7h3l-5 7h6v6m1-20 5 7h-3l5 7h-7',
  Food: 'M7 3v7m-3-7v5a3 3 0 0 0 6 0V3M7 11v10m10-18v18m0-18c-4 3-4 8 0 9',
  Gaming: 'M5 7h14l3 11-5-2H7l-5 2L5 7Zm2 3v5m-2-2h4m7-2h.1m2 3h.1',
  Photography: 'M3 7h5l2-3h4l2 3h5v13H3V7Zm13 6a4 4 0 1 0-8 0 4 4 0 0 0 8 0Z',
  Movies: 'm6 3 15 9-15 9V3Z',
  Fitness: 'm4 20 16-16M11 4h9v9',
  Study: 'M4 3h16v18H4V3Zm3 4h10M7 11h10M7 15h10',
  Books: 'M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3V4Zm9 2v16',
  Games: 'M5 7h14l3 11-5-2H7l-5 2L5 7Zm2 3v5m-2-2h4m7-2h.1m2 3h.1',
  Sports: 'M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0ZM3 12h18M12 3c-6 5-6 13 0 18m0-18c6 5 6 13 0 18',
}
function InterestIcon({ name }: { name: string }) {
  return <svg className="friends-interest-icon" aria-hidden="true" viewBox="0 0 24 24"><path d={interestArt[name] ?? 'm12 3 3 6 6 3-6 3-3 6-3-6-6-3 6-3 3-6Z'} /></svg>
}
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const week = [1, 2, 3, 4, 5, 6, 0]
const blocks = [
  { label: 'Morning', start_time: '08:00:00', end_time: '12:00:00' },
  { label: 'Afternoon', start_time: '12:00:00', end_time: '17:00:00' },
  { label: 'Evening', start_time: '17:00:00', end_time: '21:00:00' },
  { label: 'Late', start_time: '21:00:00', end_time: '24:00:00' },
]
type Windows = MatchingProfile['availability']
type Block = typeof blocks[number]

// Coarse controls never round stored windows. Only the explicitly edited interval
// is replaced; exact portions before/after it (including pre-08:00) survive.
function blockState(values: Windows, dow: number, block: Block): boolean | 'mixed' {
  const overlaps = values.filter(w => w.dow === dow && w.start_time < block.end_time && w.end_time > block.start_time).sort((a, b) => a.start_time.localeCompare(b.start_time))
  let covered = block.start_time
  for (const window of overlaps) {
    if (window.start_time > covered) break
    if (window.end_time > covered) covered = window.end_time
  }
  return covered >= block.end_time ? true : overlaps.length ? 'mixed' : false
}
function toggleBlock(values: Windows, dow: number, block: Block): Windows {
  const next = values.flatMap(window => {
    if (window.dow !== dow || window.end_time <= block.start_time || window.start_time >= block.end_time) return [window]
    const remainder: Windows = []
    if (window.start_time < block.start_time) remainder.push({ ...window, end_time: block.start_time })
    if (window.end_time > block.end_time) remainder.push({ ...window, start_time: block.end_time })
    return remainder
  })
  if (blockState(values, dow, block) !== true) next.push({ dow, start_time: block.start_time, end_time: block.end_time })
  return next
}

export function FriendsAvailability({ values, onChange, disabled }: { values: Windows; onChange: (values: Windows) => void; disabled: boolean }) {
  const id = useId()
  const [error, setError] = useState('')
  return <section className="friends-box friends-availability" role="group" aria-labelledby={`${id}-title`}>
    <header><h3 id={`${id}-title`}>Make a little time.</h3><button type="button" className="friends-clear" aria-label="Clear availability" disabled={disabled || !values.length} onClick={() => { onChange([]); setError('') }}>Clear</button></header>
    <p id={`${id}-help`}>Weekly availability · America/New_York</p>
    <table aria-label="Weekly availability" aria-describedby={`${id}-help`}><colgroup><col className="friends-time-column" /><col span={7} /></colgroup><thead><tr><td />{week.map(dow => <th key={dow} scope="col" abbr={days[dow]}>{days[dow].slice(0, 3)}</th>)}</tr></thead>
      <tbody>{blocks.map(block => <tr key={block.label}><th scope="row">{block.label}<small>{block.start_time.slice(0, 2)}–{block.end_time.slice(0, 2)}</small></th>{week.map(dow => {
        const state = blockState(values, dow, block)
        return <td key={dow}><button type="button" aria-pressed={state} aria-label={`${days[dow]} ${block.label.toLowerCase()}, ${state === 'mixed' ? 'partially available' : state ? 'available' : 'not available'}`} disabled={disabled} onClick={() => {
          const next = toggleBlock(values, dow, block)
          if (next.length > 56) { setError('Up to 56 exact windows are supported. Remove a window before adding this block.'); return }
          onChange(next); setError('')
        }}>{state === true ? '✓' : state === 'mixed' ? '·' : ''}</button></td>
      })}</tr>)}</tbody>
    </table>
    <p className="friends-key">Sage = available · Striped = partial exact times</p>
    {error && <p role="alert">{error}</p>}
  </section>
}

export function FriendsInterests({ values, onChange, disabled }: { values: string[]; onChange: (values: string[]) => void; disabled: boolean }) {
  const id = useId(), input = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false), [draft, setDraft] = useState(''), [error, setError] = useState('')
  useEffect(() => { if (open) input.current?.focus() }, [open])
  const options = [...values, ...catalog.filter(option => !values.some(value => value.toLowerCase() === option.toLowerCase()))]
  const add = () => {
    if (disabled) return
    const label = draft.trim().replace(/\s+/g, ' ')
    if (!label) { setError('Type an interest first.'); return }
    if (label.split(' ').length > 2) { setError('Use a maximum of two words.'); return }
    if (label.length > 40) { setError('Use 40 characters or fewer.'); return }
    if (values.some(value => value.trim().replace(/\s+/g, ' ').toLowerCase() === label.toLowerCase())) { setError('That interest is already selected.'); return }
    if (values.length >= 30) { setError('Choose up to 30 interests. Remove one first.'); return }
    onChange([...values, catalog.find(option => option.toLowerCase() === label.toLowerCase()) ?? label]); setDraft(''); setError('')
  }
  return <section className="friends-box friends-interests" role="group" aria-label="Interests">
    <header><h3 id={`${id}-title`}>What are you into?</h3><span>{values.length}/30 selected</span></header>
    <p className="friends-section-hint">Start with something you have in common.</p>
    <div className="friends-chips" role="group" aria-label="Edit interests">{options.map((option, index) => {
      const selected = values.includes(option)
      return <button key={`${option}-${index}`} type="button" aria-label={option} aria-pressed={selected} disabled={disabled || (!selected && values.length >= 30)} onClick={() => onChange(selected ? values.filter(value => value !== option) : [...values, option])}><InterestIcon name={option} /><span>{option}</span>{selected && <span aria-hidden="true" className="friends-interest-check">✓</span>}</button>
    })}<button type="button" className="friends-add" aria-label="Add yours" disabled={disabled} onClick={() => { setOpen(true); input.current?.focus() }}>+ Add yours</button></div>
    {open && <div className="friends-custom"><label htmlFor={`${id}-input`}>Add a matching interest</label><div><input ref={input} id={`${id}-input`} value={draft} disabled={disabled} aria-invalid={!!error} aria-describedby={`${id}-help`} onChange={event => { setDraft(event.target.value); setError('') }} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); add() } }} /><button type="button" disabled={disabled} onClick={add}>Add interest</button></div><p id={`${id}-help`}>One or two words, up to 40 characters.</p>{error && <p role="alert">{error}</p>}</div>}
  </section>
}

export function FriendsScene({ searching = false }: { searching?: boolean }) {
  return <div className={`friends-scene${searching ? ' is-searching' : ''}`} aria-hidden="true">
    <img className="friends-mascot" src="/prototype/friends/pebble-mascot.png" width="528" height="348" alt="" />
    {[1, 2, 3].map(index => <span className={`friends-companion friends-companion-${index}`} key={index}><img src="/prototype/friends/pebble-companion.png" alt="" /></span>)}
    <span className="friends-twinkle">✦</span><span className="friends-reward">A little time. New connections.</span>
  </div>
}

export function FriendsPartyPreference({ disabled }: { disabled: boolean }) {
  // Presentation only. Never persisted or included in a matching request.
  const [size, setSize] = useState(2)
  return <div className="friends-party" role="group" aria-label="New friends presentation preference"><span>Room for a few more?</span><div>{[1, 2, 3].map(value => <button type="button" disabled={disabled} key={value} aria-pressed={size === value} onClick={() => setSize(value)}>{value} {value === 1 ? 'friend' : 'friends'}</button>)}</div><small>Visual preference only. Searches suggest one person.</small></div>
}
