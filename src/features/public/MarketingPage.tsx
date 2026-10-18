import { Link } from 'react-router'
import { useState } from 'react'
import { CommunityMedia, PebblePouch } from './MarketingMedia'
import { useMarketingReducedMotion } from './useMarketingReducedMotion'
import { publicAuthPath } from './links'
import './marketing.css'

export function MarketingPage() {
  const [paused, setPaused] = useState(false)
  const reducedMotion = useMarketingReducedMotion()
  const motionLabel = reducedMotion ? 'Motion reduced' : paused ? 'Resume motion' : 'Pause motion'
  return <div className="public-marketing" data-paused={paused}>
    <section className="public-hero" aria-labelledby="public-title">
      <div className="public-hero-copy"><h1 id="public-title">Find a little time in common.</h1>
        <p>Meet people at college through shared interests, free time, and things to do together.</p>
        <div className="public-actions"><Link className="pt-button pt-discovery-action" to={publicAuthPath('register')}>Get started</Link><Link className="public-text-link" to="/events">Explore events</Link></div>
        <span className="public-small">Just browsing? Events are open to everyone.</span>
      </div>
      <div className="marketing-hero-visual"><PebblePouch /><div className="marketing-visual-footer"><button className="marketing-motion-control" aria-label={motionLabel} title={motionLabel} aria-pressed={paused || reducedMotion} disabled={reducedMotion} onClick={() => setPaused(value => !value)}><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{paused || reducedMotion ? <path d="M7 4 20 12 7 20Z" /> : <path d="M6 4H10V20H6ZM14 4H18V20H14Z" />}</svg></button></div></div>
    </section>
    <section className="marketing-story" aria-labelledby="public-story-title">
      <h2 id="public-story-title">A little overlap.<br />A real plan.</h2>
      <div className="marketing-story-copy"><p>Same interests. A free afternoon. Start with something in common, and see who you could meet.</p><Link className="public-text-link" to={publicAuthPath('register', '/matchmaking')}>Find your people</Link></div>
      <div className="marketing-story-copy"><p>Or start with something to do. Explore events, find your kind of thing, then look for company.</p><Link className="public-text-link" to="/events">Explore events</Link></div>
    </section>
    <section className="marketing-community" aria-labelledby="public-community-title">
      <div className="marketing-community-heading"><h2 id="public-community-title">Small beginnings.<br />A place of your own.</h2><p>Meet your Pebble. Add a little character.<br />Make yourself at home in Community.</p></div>
      <CommunityMedia paused={paused} reducedMotion={reducedMotion} />
    </section>
    <section className="public-final"><h2>Your people are out there.</h2><Link className="pt-button pt-discovery-action" to={publicAuthPath('register')}>Create an account</Link><p>Already have an account? <Link to={publicAuthPath('login')}>Sign in</Link></p></section>
  </div>
}
