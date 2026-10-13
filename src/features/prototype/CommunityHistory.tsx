import type { CSSProperties } from 'react'
import { Icon } from './ui'
import { historyWeekCount, type CommunityDay } from './community-history'

const shortDate = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
export function CommunityHistory({ days, selected, week, select, changeWeek }: { days: CommunityDay[]; selected: number; week: number; select: (day: number) => void; changeWeek: (week: number) => void }) {
  return <section className="pt-community-history" aria-label="Weekly community activity">
    <div className="pt-history-bars" role="group" aria-label="Select a day">
      {days.map((day, index) => <button key={day.date.toISOString()} aria-pressed={selected === index} aria-controls="community-diorama" aria-label={`${shortDate(day.date)}, ${day.activity} Pebbles of activity`} title={`${shortDate(day.date)} · ${day.activity} Pebbles`} onClick={() => select(index)} style={{ '--bar-strength': `${20 + Math.min(1, day.activity / 30) * 60}%`, '--bar-height': `${Math.max(6, day.activity / 30 * 100)}%` } as CSSProperties}><span className="pt-history-track"><span className="pt-history-bar" /></span><span>{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][index]}</span></button>)}
    </div>
    <div className="pt-history-dates"><button className="pt-icon-button pt-quiet-icon" aria-label="Previous week" title="Previous week" disabled={week === historyWeekCount - 1} onClick={() => changeWeek(week + 1)}><Icon name="back" size={24} /></button><span>{shortDate(days[0].date)} – {shortDate(days[6].date)}</span><button className="pt-icon-button pt-quiet-icon" aria-label="Next week" title="Next week" disabled={week === 0} onClick={() => changeWeek(week - 1)}><Icon name="chevron" size={24} /></button></div>
    <p className="pt-sr-only" role="status">{shortDate(days[selected].date)} selected. {days[selected].activity} Pebbles of activity. Community growth stage {days[selected].stage}.</p>
  </section>
}
