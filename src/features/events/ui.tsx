import type { ReactNode } from 'react'
const paths: Record<string, ReactNode> = {
  events: <><rect x="4" y="5" width="16" height="16" rx="3" /><path d="M8 3v4m8-4v4M4 11h16m-12 4h2m4 0h2m-8 3h2" /></>,
  time: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
  pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z" /><circle cx="12" cy="10" r="2" /></>,
  arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
  back: <path d="m14 5-7 7 7 7" />,
  check: <path d="m5 12 4 4L19 6" />,
}
export function Icon({ name, size = 22 }: { name: string; size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.profile}</svg> }
export function Header({ title, sub, back, action }: { title: string; sub?: string; back?: () => void; action?: ReactNode }) { return <header className="ev-page-heading">{back && <button className="ev-icon-button" aria-label="Back" onClick={back}><Icon name="back" /></button>}<div><h1 tabIndex={-1}>{title}</h1>{sub && <p>{sub}</p>}</div>{action}</header> }
export function Button({ children, onClick, secondary = false, disabled = false, type = 'button', className = '' }: { children: ReactNode; onClick?: () => void; secondary?: boolean; disabled?: boolean; type?: 'button' | 'submit'; className?: string }) { return <button type={type} onClick={onClick} disabled={disabled} className={`ev-button ${secondary ? 'ev-secondary' : ''} ${className}`}>{children}</button> }
export function Chips({ options, values, onChange, multi = false, label }: { options: string[]; values: string[]; onChange: (values: string[]) => void; multi?: boolean; label: string }) { return <div className="ev-chips" role="group" aria-label={label}>{options.map(value => <button type="button" key={value} aria-pressed={values.includes(value)} onClick={() => onChange(multi ? (values.includes(value) ? values.filter(v => v !== value) : [...values, value]) : [value])}>{values.includes(value) && <Icon name="check" size={16} />}{value}</button>)}</div> }
