import { Link, NavLink } from 'react-router'
import { legalDocuments, legalPublication } from './legal-content'

export function LegalPage({ document }: { document: keyof typeof legalDocuments }) {
  const content = legalDocuments[document]
  return <div className="legal-layout">
    <nav className="legal-nav" aria-label="Legal documents"><NavLink to="/terms">Terms of Service</NavLink><NavLink to="/privacy">Privacy Policy</NavLink><NavLink to="/cookies">Cookie Policy</NavLink></nav>
    <article className="legal-copy"><h1>{content.title}</h1><p className="legal-meta">Updated {legalPublication.updated}</p><p className="legal-summary">{content.summary}</p>
      {content.sections.map(section => <section key={section.title}><h2>{section.title}</h2>{section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</section>)}
      <section><h2>Operator and contact</h2><p>Legal operator: <strong>{legalPublication.operator}</strong></p><p>Public contact email: <strong>{legalPublication.contactEmail}</strong></p></section>
      <section><Link to="/">Back to Pebble</Link></section>
    </article>
  </div>
}
