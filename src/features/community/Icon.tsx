type IconName = 'leaf' | 'pebble' | 'arrow' | 'sun' | 'people' | 'check' | 'reset' | 'close' | 'pin' | 'clock' | 'spark' | 'lock'
const paths: Record<IconName, string> = {
  leaf: 'M20 4C10 2 3 6 5 14c7 4 15-1 15-10ZM4 21 15 10M10 15v-5',
  pebble: 'M5 19c-4-3 0-11 4-14 3-3 6-1 9 3 4 5 4 10 0 12-4 2-10 1-13-1ZM9 13v1m6-1v1m-5 3q2 2 4 0',
  arrow: 'M5 12h14m-6-6 6 6-6 6', sun: 'M12 3V1m0 22v-2M3 12H1m22 0h-2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  people: 'M16 21v-3a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v3M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M17 4a4 4 0 0 1 0 8m2 3q3 1 3 5',
  check: 'm5 12 4 4L19 6', reset: 'M3 10a9 9 0 1 1 2 9M3 4v6h6', close: 'm6 6 12 12M6 18 18 6',
  pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  clock: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M12 6v6l4 2',
  spark: 'm12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z',
  lock: 'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5V10Zm7 5v2',
}
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}
