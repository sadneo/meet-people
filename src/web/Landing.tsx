import { Link } from 'react-router'
import { legalPublication } from '../features/public/legal-content'
import { GardenPreview } from './components/GardenPreview'
import { ProfilePreview } from './components/ProfilePreview'
import './landing.css'

const googlePlayUrl = 'https://play.google.com/store/apps'

function Wordmark() {
  return <Link className="landing-wordmark" to="/" aria-label="Pebble home"><img src="/garden/pebble-wordmark.svg" alt="Pebble" width="150" height="66" /></Link>
}

function StoreLinks() {
  return <div className="landing-stores" id="install">
    <a className="landing-store landing-google" href={googlePlayUrl} target="_blank" rel="noopener noreferrer" aria-label="Open Google Play for Android">
      <svg viewBox="0 0 32 36" aria-hidden="true"><path fill="#34a853" d="M1 1 19 18 1 35Z"/><path fill="#4285f4" d="m1 1 22 13-4 4Z"/><path fill="#fbbc04" d="m23 14 7 4-7 4Z"/><path fill="#ea4335" d="m1 35 18-17 4 4Z"/></svg>
      <span><small>Download for Android</small><b>Google Play</b></span>
    </a>
    <div className="landing-store landing-apple" role="status" aria-label="iOS App Store: coming soon">
      <svg viewBox="0 0 24 28" fill="currentColor" aria-hidden="true"><path d="M18.7 14.7c0-3 2.4-4.5 2.5-4.6-1.4-2.1-3.5-2.4-4.3-2.4-1.8-.2-3.5 1.1-4.4 1.1-.9 0-2.3-1.1-3.8-1.1-2 .1-3.9 1.2-4.9 3-2.1 3.6-.5 9 1.5 11.9 1 1.4 2.1 2.9 3.6 2.8 1.5-.1 2-1 3.8-1s2.3 1 3.9 1c1.6 0 2.6-1.4 3.6-2.8 1.1-1.6 1.5-3.2 1.6-3.3-.1 0-3.1-1.2-3.1-4.6ZM15.8 5.8c.8-1 1.4-2.3 1.3-3.7-1.2.1-2.6.8-3.4 1.8-.7.8-1.4 2.2-1.2 3.5 1.3.1 2.5-.6 3.3-1.6Z"/></svg>
      <span><small>Coming soon for iOS</small><b>App Store</b></span>
    </div>
  </div>
}

export function Landing() {
  return <div className="web-landing">
    <header className="landing-header">
      <Wordmark />
      <nav className="landing-nav" aria-label="Website navigation"><Link to="/explore">Events</Link></nav>
    </header>
    <main className="landing-main">
      <section className="landing-hero">
        <div className="landing-copy"><h1><span>Meet new friends,</span><br/>find a date,<br/>and make plans.</h1><StoreLinks /></div>
        <ProfilePreview />
      </section>
      <GardenPreview />
    </main>
    <footer className="landing-footer"><Wordmark /><div><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><a href={`mailto:${legalPublication.contactEmail}`}>Safety</a></div></footer>
  </div>
}
