import { Link, useLocation } from "react-router";
import './parity-public.css';
import {
  legalDocuments,
  legalPublication,
} from "../features/public/legal-content";
import { Brand } from "./common";
import { safeReturnTo } from "../auth/returnTo";

export function Legal({ kind }: { kind: keyof typeof legalDocuments }) {
  const document = legalDocuments[kind];
  const state = useLocation().state;
  const source = state?.authFrom;
  const authPath = source === '/login' || source === '/register' || source === '/auth/forgot-password' ? source : null;
  const returnTo = safeReturnTo(state?.returnTo);
  const back = authPath && returnTo && returnTo !== '/'
    ? `${authPath}?${new URLSearchParams({ returnTo })}`
    : authPath ?? '/';
  const backLabel = authPath === '/login' ? 'Back to sign in' : authPath === '/register'
    ? 'Back to registration' : authPath === '/auth/forgot-password' ? 'Back to password recovery' : 'Back to Pebble';
  const policyState = authPath ? { authFrom: authPath, returnTo } : undefined;
  return (
    <div className="legal-page">
      <header className="legal-header">
        <Brand />
        <Link to={back}>{backLabel}</Link>
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
        <nav className="legal-resource-links" aria-label="Safety and account requests">
          <Link to="/delete-account" state={policyState}>Delete your account</Link>
          <Link to="/child-safety" state={policyState}>Child safety standards</Link>
        </nav>
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
