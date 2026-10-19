export function CardIcon({ name }: { name: 'friends' | 'heart' | 'filter' | 'info' | 'undo' | 'x' | 'star' | 'pin' | 'distance' | 'height' }) {
  const paths = {
    pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2" /></>,
    distance: <><path d="m4 7 4-4 4 4M8 3v14a4 4 0 0 0 8 0V7m-4 4 4-4 4 4" /></>,
    height: <><path d="M8 3h10v18H8V3Zm5 4h5m-3 4h3m-5 4h5m-3 3h3" /></>,
    heart: <path d="M20 5c-3-3-6-1-8 1-2-2-5-4-8-1s-1 7 1 9l7 7 7-7c2-2 4-6 1-9Z" />,
    friends: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2m1-15a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v1" /></>,
    filter: <><path d="M3 6h7m4 0h7M3 12h12m4 0h2M3 18h3m4 0h11" /><circle cx="12" cy="6" r="2" /><circle cx="17" cy="12" r="2" /><circle cx="8" cy="18" r="2" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v.1" /></>,
    undo: <><path d="m8 4-5 5 5 5M3 9h10a7 7 0 0 1 0 14" /></>,
    x: <path d="m6 6 12 12M18 6 6 18" />,
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" />,
  }
  return <svg aria-hidden="true" data-icon={name} viewBox="0 0 24 24">{paths[name]}</svg>
}
