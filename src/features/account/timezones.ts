const commonLabels: Record<string, string> = {
  'America/New_York': 'Eastern Time · New York',
  'America/Chicago': 'Central Time · Chicago',
  'America/Denver': 'Mountain Time · Denver',
  'America/Los_Angeles': 'Pacific Time · Los Angeles',
  'America/Phoenix': 'Arizona · Phoenix',
  'America/Anchorage': 'Alaska · Anchorage',
  'Pacific/Honolulu': 'Hawaii · Honolulu',
  UTC: 'Coordinated Universal Time · UTC',
};

export function timezoneOptions(savedZone: string) {
  const fallback = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Asia/Kolkata', 'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney'];
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : fallback;
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return [...new Set(['UTC', ...zones, deviceZone, savedZone].filter(Boolean))].map(value => {
    const parts = value.split('/');
    const name = commonLabels[value] ?? `${parts.at(-1)!.replaceAll('_', ' ')}${parts.length > 1 ? ` · ${parts[0]}` : ''}`;
    let offset = '';
    try { offset = Intl.DateTimeFormat('en', { timeZone: value, timeZoneName: 'shortOffset' }).formatToParts().find(part => part.type === 'timeZoneName')?.value ?? ''; } catch { /* Preserve a saved label for read-only recovery. */ }
    return { value, label: `${name}${offset ? ` (${offset})` : ''}`, device: value === deviceZone };
  }).sort((a, b) => a.label.localeCompare(b.label));
}
