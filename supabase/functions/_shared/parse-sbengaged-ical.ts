import type { SbEngagedFeedEvent } from './normalize-sbengaged.ts'

type Properties = Map<string, string[]>

function unfold(value: string) {
  return value.replace(/\r?\n[ \t]/g, '')
}

function decodeQuotedPrintable(value: string) {
  return value
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/gi, (match, hex: string) => {
      const code = Number.parseInt(hex, 16)
      return code >= 32 ? String.fromCharCode(code) : match
    })
}

function decodeText(value: string) {
  const decoded = value.startsWith('__QP__') ? decodeQuotedPrintable(value.slice(6)) : value
  return decoded
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim()
}

function parseDateTime(value: string | undefined) {
  if (!value || !/^\d{8}T\d{6}Z$/.test(value)) return null
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`
  return Number.isNaN(Date.parse(iso)) ? null : new Date(iso).toISOString()
}

function addProperty(properties: Properties, line: string) {
  const separator = line.indexOf(':')
  if (separator < 1) return
  const nameAndParameters = line.slice(0, separator)
  const name = nameAndParameters.split(';', 1)[0]?.toUpperCase()
  if (!name) return
  const rawValue = line.slice(separator + 1)
  const encodedValue = /ENCODING=QUOTED-PRINTABLE/i.test(nameAndParameters) ? `__QP__${rawValue}` : rawValue
  const value = name === 'CATEGORIES' && /X-CG-CATEGORY=event_type/i.test(nameAndParameters)
    ? `event_type:${encodedValue}`
    : encodedValue
  properties.set(name, [...(properties.get(name) ?? []), value])
}

function property(properties: Properties, name: string) {
  return properties.get(name)?.[0]
}

function eventType(properties: Properties) {
  return properties.get('CATEGORIES')
    ?.find((value) => value.startsWith('event_type:'))
    ?.slice('event_type:'.length)
}

function description(value: string | undefined) {
  const decoded = value ? decodeText(value) : ''
  return decoded.replace(/\n---\nEvent Details:\s*https?:\/\/\S+\s*$/i, '').trim() || undefined
}

function toEvent(properties: Properties): SbEngagedFeedEvent {
  return {
    summary: property(properties, 'SUMMARY') ? decodeText(property(properties, 'SUMMARY')) : undefined,
    description: description(property(properties, 'DESCRIPTION')),
    startsAt: parseDateTime(property(properties, 'DTSTART')) ?? undefined,
    endsAt: parseDateTime(property(properties, 'DTEND')) ?? undefined,
    location: property(properties, 'LOCATION') ? decodeText(property(properties, 'LOCATION')) : undefined,
    eventType: eventType(properties) ? decodeText(eventType(properties)) : undefined,
    url: property(properties, 'URL') ? decodeText(property(properties, 'URL')) : undefined,
  }
}

export function parseSbEngagedICal(input: string) {
  const events: SbEngagedFeedEvent[] = []
  let properties: Properties | null = null

  for (const line of unfold(input).split(/\r?\n/)) {
    if (line === 'BEGIN:VEVENT') {
      properties = new Map()
    } else if (line === 'END:VEVENT') {
      if (properties) events.push(toEvent(properties))
      properties = null
    } else if (properties) {
      addProperty(properties, line)
    }
  }

  return events
}
