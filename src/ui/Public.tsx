import { Link } from "react-router";
import {
  legalDocuments,
  legalPublication,
} from "../features/public/legal-content";
import { Brand, Icon } from "./common";

export function Landing() {
  return (
    <div className="welcome-site">
      <header className="welcome-header">
        <Brand />
        <nav className="welcome-nav" aria-label="Website navigation">
          <Link to="/explore">Events</Link>
        </nav>
        <Link className="welcome-open" to="/login">
          Sign in ↗
        </Link>
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
              <Link className="welcome-primary" to="/login">
                Get started ↗
              </Link>
              <Link className="welcome-secondary" to="/explore">
                Browse events
              </Link>
            </div>
          </div>
          <div className="welcome-visual">
            <div className="welcome-preview-mode">
              <span>
                <Icon name="Friends" />
                Friends
              </span>
              <span>
                <Icon name="Dating" />
                Dating
              </span>
            </div>
            <div className="welcome-profile">
              <img
                src="/pebble/alex.jpg"
                alt="Illustrative profile on Pebble"
              />
              <div className="welcome-profile-shade" />
              <div className="welcome-profile-info">
                <h3>Your next hello.</h3>
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
            <h2>Grow your garden.</h2>
          </div>
        </section>
      </main>
      <footer className="welcome-footer">
        <Brand />
        <div>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/cookies">Cookies</Link>
        </div>
      </footer>
    </div>
  );
}
export function Legal({ kind }: { kind: "terms" | "privacy" | "cookies" }) {
  const document = legalDocuments[kind];
  return (
    <div className="legal-page">
      <header className="legal-header">
        <Brand />
        <Link to="/">Back to Pebble</Link>
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
