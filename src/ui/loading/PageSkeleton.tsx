import './skeletons.css'

export type SkeletonView = 'events' | 'event' | 'discover' | 'inbox' | 'chat' | 'profile' | 'settings' | 'list' | 'garden' | 'dining'
function Line({ short = false }: { short?: boolean }) { return <span className={`skeleton-shape skeleton-line${short ? ' short' : ''}`} /> }
function Row() { return <div className="skeleton-row"><span className="skeleton-shape skeleton-avatar"/><div><Line/><Line short/></div></div> }

export function PageSkeleton({ view, label = 'Loading saved content' }: { view: SkeletonView; label?: string }) {
  let shapes
  if (view === 'events') shapes = <div className="eventgrid event-directory">{Array.from({ length: 6 }, (_, i) => <div className="skeleton-card" key={i}><span className="skeleton-shape skeleton-cover"/><div className="skeleton-copy"><Line short/><Line/><Line short/></div></div>)}</div>
  else if (view === 'event' || view === 'discover') shapes = <div className={`skeleton-feature ${view}`}><span className="skeleton-shape skeleton-cover"/><Line/><Line short/><Line/></div>
  else if (view === 'dining') shapes = <div className="skeleton-rows"><Line short/>{Array.from({ length: 4 }, (_, i) => <div className="skeleton-copy" key={i}><Line/><Line short/></div>)}</div>
  else if (view === 'chat') shapes = <div className="skeleton-chat"><Row/><span className="skeleton-shape skeleton-bubble"/><span className="skeleton-shape skeleton-bubble own"/><span className="skeleton-shape skeleton-bubble"/></div>
  else if (view === 'garden') shapes = <div className="skeleton-garden-scene"><span className="skeleton-shape skeleton-island"/></div>
  else shapes = <div className={`skeleton-rows ${view}`}>{Array.from({ length: view === 'inbox' ? 4 : 3 }, (_, i) => <Row key={i}/>)}</div>
  return <div className={`page-skeleton skeleton-${view}`} role="status" aria-live="polite" aria-busy="true" data-skeleton={view}><span className="sr-only">{label}</span><div aria-hidden="true">{shapes}</div></div>
}
