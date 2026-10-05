import type { ReactNode } from 'react'
import { people, type Person } from './model'

export function Pebble({ expression = 'happy', className = '' }: { expression?: 'happy' | 'neutral' | 'surprised'; className?: string }) {
  return <svg className={`pt-pebble ${className}`} viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="33" cy="58" rx="25" ry="4" fill="#506b44" opacity=".14" /><path d="M26 6C15 7 5 30 6 44c1 13 14 15 29 14 18 0 25-4 24-16C58 28 46 5 34 5Z" fill="#bab5a0" stroke="#7a7b65" strokeWidth="2" /><path d="M27 10c-8 3-14 17-15 26" fill="none" stroke="#e3dbc3" strokeWidth="4" strokeLinecap="round" /><path d="M23 32v3m18-3v3" stroke="#434939" strokeWidth="3.5" strokeLinecap="round" />{expression === 'surprised' ? <ellipse cx="33" cy="42" rx="3" ry="4" fill="#434939" /> : <path d={expression === 'happy' ? 'M28 40q5 6 10 0' : 'M29 42h8'} fill="none" stroke="#434939" strokeWidth="2" strokeLinecap="round" />}<path d="M16 40h5m23 0h5" stroke="#d89379" strokeWidth="3" strokeLinecap="round" /></svg>
}
export function Pouch() {
  return <svg viewBox="0 0 140 150" aria-hidden="true"><path d="M49 46c-5 15-29 35-29 59 0 25 21 28 49 28s51-4 51-28c0-24-26-45-31-59Z" fill="#cba575" stroke="#9b7954" strokeWidth="3" /><path className="pt-pouch-mouth" d="m50 47-9-28 14 5 13-7 13 7 17-5-11 28Z" fill="#dcc095" stroke="#9b7954" strokeWidth="3" /><path d="M46 48q24 8 46 0m-22 5-12 15m12-15 19 11" stroke="#77845a" strokeWidth="5" fill="none" strokeLinecap="round" /><path d="M58 95c-2-13 7-20 24-17 0 15-10 23-23 18m-3 6 17-18" fill="#77845a" stroke="#607049" strokeWidth="2" /></svg>
}
const paths: Record<string, ReactNode> = {
  events: <><rect x="4" y="5" width="16" height="16" rx="3" /><path d="M8 3v4m8-4v4M4 11h16m-12 4h2m4 0h2m-8 3h2" /></>,
  time: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  messages: <path d="M20 11a8 8 0 0 1-8 8H8l-5 3 1-6a8 8 0 1 1 16-5ZM8 10h8m-8 4h5" />,
  profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
  pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z" /><circle cx="12" cy="10" r="2" /></>,
  arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
  back: <path d="m14 5-7 7 7 7" />,
  check: <path d="m5 12 4 4L19 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  coffee: <><path d="M4 7h12v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Zm12 1h2a3 3 0 0 1 0 6h-2M3 22h16M7 2v2m5-2v2" /></>,
  games: <><path d="M8 7h8q4 0 5 9c0 4-3 5-6 1H9c-3 4-6 3-6-1Q4 7 8 7Z" /><path d="M8 10v5m-2-2h4m6-2h.1m2 3h.1" /></>,
  tree: <><path d="m12 2 7 9h-3l5 6H3l5-6H5Zm0 15v5" /></>,
  music: <><path d="M9 18V5l11-2v13M9 9l11-2" /><ellipse cx="6" cy="18" rx="3" ry="2" /><ellipse cx="17" cy="16" rx="3" ry="2" /></>,
  food: <><path d="M5 2v7q0 3 3 3t3-3V2M8 2v20M19 2q-5 5-4 11h4m0-11v20" /></>,
  book: <><path d="M12 5Q7 2 2 4v15q5-2 10 1 5-3 10-1V4q-5-2-10 1Zm0 0v15" /></>,
  settings: <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="8" cy="6" r="2" fill="currentColor" /><circle cx="16" cy="12" r="2" fill="currentColor" /><circle cx="9" cy="18" r="2" fill="currentColor" /></>,
  gear: <><path d="m9 3 .5-2h5l.5 2 2 1 2-.5 2.5 4-1.5 1.5v3L22 14l-2.5 4-2-.5-2 1-.5 2h-5l-.5-2-2-1-2 .5L2.5 14 4 12.5v-3L2.5 8 5 4l2 .5Z" /><circle cx="12" cy="11" r="3.5" /></>,
  bell: <><path d="M4 17h16l-2-3V9a6 6 0 0 0-12 0v5Zm6 4h4M12 2v1" /></>,
  map: <><path d="m3 5 6-3 6 3 6-3v17l-6 3-6-3-6 3Zm6-3v17m6-14v17" /></>,
  chevron: <path d="m9 7 5 5-5 5" />,
  logout: <><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5m-1-8h12m-5-5 5 5-5 5" /></>,
  matchmaking: <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="10" r="2.5" /><path d="M3 21v-2a6 6 0 0 1 12 0v2M14 15.5a5 5 0 0 1 7 4.5v1" /></>,
  shield: <><path d="m12 2 8 3v6c0 6-8 11-8 11S4 17 4 11V5Z" /><path d="m8 11 3 3 5-6" /></>,
  search: <><circle cx="10.5" cy="10.5" r="7" /><path d="m16 16 5 5" /></>,
  phone: <path d="m7 3 3 5-3 3c2 3 3 4 6 6l3-3 5 3c0 3-2 5-5 4C9 19 5 15 3 8 2 5 4 3 7 3Z" />,
  video: <><rect x="3" y="5" width="13" height="14" rx="2" /><path d="m16 9 5-3v12l-5-3" /></>,
  more: <><circle cx="12" cy="5" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="19" r="1" fill="currentColor" /></>,
  attachment: <path d="m8 13 6-7a3 3 0 0 1 4 4l-7 8a5 5 0 0 1-7-7l8-9" />,
  smile: <><circle cx="12" cy="12" r="9" /><path d="M8 9h.1M16 9h.1M7 14q5 6 10 0" /></>,
  graduation: <><path d="m2 8 10-5 10 5-10 5Zm4 3v6q6 5 12 0v-6M22 8v8" /></>,
  cake: <><path d="M4 12h16v9H4ZM4 15q2 4 4 0 2 4 4 0 2 4 4 0 2 4 4 0M8 7v5m4-5v5m4-5v5M8 3v1m4-1v1m4-1v1" /></>,
  leaf: <><path d="M20 3C9 2 3 7 5 15c7 3 15-1 15-12ZM4 21 15 8" /></>,
}
export function Icon({ name, size = 22 }: { name: string; size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.profile}</svg> }
export function Brand() { return <span className="pt-brand">pebble<span className="pt-brand-leaf" /><span className="pt-brand-dot">.</span></span> }
export function Avatar({ person, size = 'normal' }: { person: Pick<Person, 'name' | 'photo'>; size?: 'small' | 'normal' | 'large' }) { return <img className={`pt-avatar pt-avatar-${size}`} src={`/prototype/${person.photo}`} alt={person.name} /> }
export function Avatars({ ids }: { ids: string[] }) { return <span className="pt-avatars">{ids.map(id => { const person = people.find(p => p.id === id); return person && <Avatar key={id} person={person} size="small" /> })}</span> }
export function Header({ title, sub, back, action }: { title: string; sub?: string; back?: () => void; action?: ReactNode }) { return <header className="pt-page-heading">{back && <button className="pt-icon-button" aria-label="Back" onClick={back}><Icon name="back" /></button>}<div><h1 tabIndex={-1}>{title}</h1>{sub && <p>{sub}</p>}</div>{action}</header> }
export function Button({ children, onClick, secondary = false, disabled = false, type = 'button', className = '' }: { children: ReactNode; onClick?: () => void; secondary?: boolean; disabled?: boolean; type?: 'button' | 'submit'; className?: string }) { return <button type={type} onClick={onClick} disabled={disabled} className={`pt-button ${secondary ? 'pt-secondary' : ''} ${className}`}>{children}</button> }
export function Chips({ options, values, onChange, multi = false, label }: { options: string[]; values: string[]; onChange: (values: string[]) => void; multi?: boolean; label: string }) { return <div className="pt-chips" role="group" aria-label={label}>{options.map(value => <button type="button" key={value} aria-pressed={values.includes(value)} onClick={() => onChange(multi ? (values.includes(value) ? values.filter(v => v !== value) : [...values, value]) : [value])}>{values.includes(value) && <Icon name="check" size={16} />}{value}</button>)}</div> }
export function Empty({ title, text, action, onClick }: { title: string; text: string; action: string; onClick: () => void }) { return <div className="pt-empty"><Pebble expression="neutral" /><h2>{title}</h2><p>{text}</p><Button onClick={onClick}>{action}</Button></div> }
