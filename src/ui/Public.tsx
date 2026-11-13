import { Link, useLocation } from "react-router";
import './parity-public.css';
import {
  legalDocuments,
  legalPublication,
} from "../features/public/legal-content";
import { Brand } from "./common";

export function Legal({ kind }: { kind: keyof typeof legalDocuments }) {
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
        <nav aria-label="Safety and account requests"><Link to="/delete-account">Delete your account</Link>{' · '}<Link to="/child-safety">Child safety standards</Link></nav>
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
