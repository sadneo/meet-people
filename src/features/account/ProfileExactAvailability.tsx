import type { MatchingProfile } from '../../../shared/matchmaking'

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
// The same exact tuples as the saved profile; never infer or round from coarse cells.
export function ProfileExactAvailability({ values, disabled, onChange }: { values: MatchingProfile['availability']; disabled: boolean; onChange: (value: MatchingProfile['availability']) => void }) {
  return <details className="account-exact-times"><summary>Exact time windows ({values.length})</summary>
    {values.map((window, index) => <div className="account-exact-row" key={index}>
      <label>Day {index + 1}<select disabled={disabled} value={window.dow} onChange={event => onChange(values.map((item, i) => i === index ? { ...item, dow: Number(event.target.value) } : item))}>{days.map((day, dow) => <option key={day} value={dow}>{day}</option>)}</select></label>
      {(['start_time', 'end_time'] as const).map(field => <label key={field}>{field === 'start_time' ? 'Start' : 'End'} {index + 1}<input disabled={disabled} value={window[field]} onChange={event => onChange(values.map((item, i) => i === index ? { ...item, [field]: event.target.value } : item))} /></label>)}
      <button type="button" className="account-secondary" disabled={disabled} onClick={() => onChange(values.filter((_, i) => i !== index))}>Remove window {index + 1}</button>
    </div>)}
    <button type="button" className="account-secondary" disabled={disabled || values.length >= 56} onClick={() => onChange([...values, { dow: 1, start_time: '17:00:00', end_time: '21:00:00' }])}>Add time window</button>
  </details>
}
