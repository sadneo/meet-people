import { Link, useLocation } from "react-router";
import { useState } from 'react';
import './parity-public.css';
import {
  legalDocuments,
  legalPublication,
} from "../features/public/legal-content";
import { Brand, Icon } from "./common";

export function Landing() {
  const [previewMode, setPreviewMode] = useState<'Friends' | 'Dating'>('Friends');
  return (
    <div className="welcome-site">
      <header className="welcome-header">
        <Brand />
        <nav className="welcome-nav" aria-label="Website navigation">
          <Link to="/explore">Events</Link>
        </nav>
        <a className="welcome-open" href="#install">Get Pebble</a>
      </header>
      <main className="welcome-main">
        <section className="welcome-hero">
          <div className="welcome-copy">
            <h1>
              <span className="welcome-headline-brand">Meet new friends,</span>
              <br />
              find a date,
              <br />
              and make plans.
            </h1>
            <div className="welcome-actions">
              <a className="welcome-primary" href="#install">Get Pebble</a>
              <Link className="welcome-secondary" to="/explore">
                Browse events
              </Link>
            </div>
          </div>
          <div className="welcome-visual">
            <div className="welcome-preview-mode" role="group" aria-label="Preview a matching mode">
              {(['Friends', 'Dating'] as const).map(mode => <button type="button" key={mode} aria-pressed={previewMode === mode} onClick={() => setPreviewMode(mode)}><Icon name={mode}/>{mode}</button>)}
            </div>
            <div className="welcome-profile">
              <img
                src={previewMode === 'Friends' ? '/pebble/alex.jpg' : '/pebble/maya.jpg'}
                alt={`Illustrative ${previewMode} profile, not an available account`}
              />
              <div className="welcome-profile-shade" />
              <div className="welcome-profile-info">
                <h3>{previewMode === 'Friends' ? 'Alex, 22' : 'Maya, 21'}</h3>
              </div>
            </div>
          </div>
        </section>
        <section className="welcome-community">
          <div className="welcome-garden-art">
            <img
              src="/pebble/square-garden-cutout.png"
              alt="Pebble’s floating pixel garden"
              loading="lazy"
            />
          </div>
          <div className="welcome-community-copy">
            <h2>Grow your garden</h2>
          </div>
        </section>
        <section id="install" className="welcome-install" aria-labelledby="install-title">
          <h2 id="install-title">Take Pebble with you.</h2>
          <p>Meet people and find a group for your next event in the Pebble app.</p>
          <h3>Android — coming soon</h3>
          <p>Installation details will be available here when Pebble is ready to download.</p>
          <p className="muted">iOS is planned.</p>
          <Link className="welcome-secondary" to="/explore">Browse events while you wait</Link>
        </section>
      </main>
      <footer className="welcome-footer">
        <Brand />
        <div>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/cookies">Cookies</Link>
          <a href={`mailto:${legalPublication.contactEmail}`}>Safety</a>
        </div>
      </footer>
    </div>
  );
}
export function Legal({ kind }: { kind: "terms" | "privacy" | "cookies" }) {
  const document = legalDocuments[kind];
  const source = useLocation().state?.authFrom;
  const back = source === '/login' || source === '/register' ? source : '/';
  return (
    <div className="legal-page">
      <header className="legal-header">
        <Brand />
        <Link to={back}>{back === '/' ? 'Back to Pebble' : 'Back to sign in'}</Link>
      </header>
      <main className="legal-content">
        <h1>{document.title}</h1>
        <p>{document.summary}</p>
        <p className="muted">Updated {legalPublication.updated}</p>
        {document.sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ))}
        {(kind === 'privacy' || kind === 'terms') && <p>Map features are subject to the <a href="https://maps.google.com/help/terms_maps/">Google Maps Terms of Service</a> and <a href="https://policies.google.com/privacy">Google Privacy Policy</a>.</p>}
        <p>
          Contact{" "}
          <a href={`mailto:${legalPublication.contactEmail}`}>
            {legalPublication.contactEmail}
          </a>
          .
        </p>
      </main>
    </div>
  );
}
