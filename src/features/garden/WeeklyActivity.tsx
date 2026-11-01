import { useEffect, useRef, useState } from 'react'
import { gardenDay, gardenWeek, readGardenHistory, type GardenSnapshot } from './history'
import { GardenIcon } from './icons'
import type { Community } from './economy'

export function WeeklyActivity({ owner, community, preview, onPreview, close }: {
  owner: string; community: Community; preview: string | null;
  onPreview: (value: { day: string; snapshot: GardenSnapshot } | null) => void;
  close: () => void;
}) {
  const closeButton=useRef<HTMLButtonElement>(null)
  useEffect(()=>{closeButton.current?.focus({preventScroll:true})},[])
  const [history] = useState(() => readGardenHistory(owner))
  const today = gardenDay(), days = gardenWeek()
  const snapshot = (day: string) => day === today ? community : history[day]
  const maximum = Math.max(1, ...days.map(day => snapshot(day.key)?.owned.length ?? 0))
  return <section className="garden-week" role="region" aria-label="Weekly Garden activity">
    <header><div><strong>This week</strong><span>{preview ? `${days.find(day => day.key === preview)?.label} · preview` : 'Today · live garden'}</span></div><button ref={closeButton} onClick={close} aria-label="Close weekly activity"><GardenIcon name="close"/></button></header>
    <div className="garden-week-days" aria-label="Saved daily gardens">
      {days.map(day => {
        const saved = day.key <= today ? snapshot(day.key) : undefined
        const count = saved?.owned.length ?? 0
        const label = day.date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
        return <button key={day.key} disabled={!saved} aria-pressed={(preview ?? today) === day.key}
          aria-label={`${label}: ${saved ? `${count} Garden items${day.key === today ? ', today' : ''}` : day.key > today ? 'upcoming' : 'no saved history'}`}
          title={saved ? `${count} placed items` : day.key > today ? 'Upcoming' : 'No saved history'}
          onClick={() => onPreview(day.key === today ? null : { day: day.key, snapshot: saved! })}>
          <span className="garden-week-bar-track"><span className="garden-week-bar" style={{ height: saved ? `${Math.max(4, Math.round(count / maximum * 32))}px` : '4px' }}/></span>
          <span>{day.label}</span>
        </button>
      })}
    </div>
    <p>Placed items · history on this device</p>
  </section>
}
