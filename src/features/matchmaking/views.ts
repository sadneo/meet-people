export function isDatingView(pathname: string, search: string) {
  return (pathname === '/matchmaking' || pathname === '/downtime-matchmaking') && new URLSearchParams(search).get('view') === 'dating'
}
