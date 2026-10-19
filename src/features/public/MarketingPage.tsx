import { Link } from 'react-router'
import { CommunityMedia, PebblePouch } from './MarketingMedia'
import { useMarketingReducedMotion } from './useMarketingReducedMotion'
import { publicAuthPath, publicEventsPath } from './links'
import './marketing.css'

export function MarketingPage() {
  const reducedMotion = useMarketingReducedMotion()
  return <div className="public-marketing">
    <section className="public-hero" aria-labelledby="public-title">
      <div className="public-hero-copy"><h1 id="public-title">Find a little time in common.</h1>
        <p>Meet people at college through shared interests, free time, and things to do together.</p>
        <div className="public-actions"><Link className="pt-button pt-discovery-action" to={publicAuthPath('register')}>Get started</Link><Link className="public-text-link" to={publicEventsPath}>Explore events</Link></div>
        <span className="public-small">Just browsing? Events are open to everyone.</span>
      </div>
      <div className="marketing-hero-visual"><PebblePouch /></div>
    </section>
    <section className="marketing-story" aria-labelledby="public-story-title">
      <h2 id="public-story-title">A little overlap.<br />A real plan.</h2>
      <div className="marketing-story-copy"><p>Same interests. A free afternoon. Start with something in common, and see who you could meet.</p></div>
      <div className="marketing-story-copy"><p>Or start with something to do. Explore events, find your kind of thing, then look for company.</p><Link className="public-text-link" to={publicEventsPath}>Explore events</Link></div>
    </section>
    <section className="marketing-community" aria-labelledby="public-community-title">
      <div className="marketing-community-heading"><h2 id="public-community-title">Small beginnings.<br />A place of your own.</h2><p>Meet your Pebble. Add a little character.<br />Make yourself at home in Community.</p></div>
      <CommunityMedia reducedMotion={reducedMotion} />
    </section>
    <section className="public-final"><h2>Your people are out there.</h2><Link className="pt-button pt-discovery-action" to={publicAuthPath('register')}>Create an account</Link></section>
  </div>
}