import { useState } from 'react'
import { z } from 'zod'

const places = ['Coffee shops', 'Parks & trails', 'Casual food', 'Campus events'] as const
const distances = ['Under 10 min', '10–20 min', '20–30 min', 'Anywhere nearby'] as const
const schema = z.object({ places: z.array(z.enum(places)).max(4), distance: z.enum(distances).nullable() }).strict()
const storageKey = 'pebble.matchmaking-display-preferences'
const empty: z.infer<typeof schema> = { places: [], distance: null }
function readDeviceFields() {
  try {
    const stored = localStorage.getItem(storageKey)
    if (stored === null) return { fields: empty, error: '' }
    const parsed = schema.safeParse(JSON.parse(stored))
    if (!parsed.success) throw new Error('Invalid stored display fields')
    return { fields: parsed.data, error: '' }
  } catch { return { fields: empty, error: 'Device-only fields could not be read. No server preferences were changed.' } }
}

export function DeviceDisplayPreferences() {
  const [initial] = useState(readDeviceFields)
  const [fields, setFields] = useState(initial.fields)
  const [error, setError] = useState(initial.error)
  const [saved, setSaved] = useState(false)
  return <section><h2>Device-only display preferences</h2><p>Places and travel range stay on this device. They are not sent to matching and the algorithm does not enforce them.</p><form onSubmit={event => {
    event.preventDefault(); setSaved(false)
    try { localStorage.setItem(storageKey, JSON.stringify(fields)); setError(''); setSaved(true) }
    catch { setError('Could not save device-only fields. No server preferences were changed.') }
  }}><label>Travel range (device only)<select value={fields.distance ?? ''} onChange={event => { setSaved(false); setFields({ ...fields, distance: event.target.value ? z.enum(distances).parse(event.target.value) : null }) }}><option value="">Not selected</option>{distances.map(distance => <option key={distance}>{distance}</option>)}</select></label><fieldset><legend>Places (device only)</legend>{places.map(place => <label key={place}><input type="checkbox" checked={fields.places.includes(place)} onChange={event => { setSaved(false); setFields({ ...fields, places: event.target.checked ? [...fields.places, place] : fields.places.filter(value => value !== place) }) }} />{place}</label>)}</fieldset><button type="submit" className="match-button match-button-secondary">Save device display fields</button>{error && <p role="alert">{error}</p>}{saved && <p role="status">Display fields saved on this device only.</p>}</form></section>
}
