import { Link } from 'react-router-dom'
import { TERMS_SECTIONS, TERMS_UPDATED } from './terms'

/**
 * The terms page, reachable signed in or not — somebody deciding whether to
 * accept an invitation has to be able to read it before they have an account.
 */
export function TermsPage() {
  return (
    <div className="card prose">
      <h1>What CostMatrix stores</h1>
      <p className="muted">Last updated {TERMS_UPDATED}.</p>

      {TERMS_SECTIONS.map((section) => (
        <section key={section.id} id={section.id}>
          <h2>{section.heading}</h2>
          {section.paragraphs.map((text) => (
            <p key={text}>{text}</p>
          ))}
          {section.points && (
            <ul>
              {section.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <p className="muted">
        <Link to="/">Back to the app</Link>
      </p>
    </div>
  )
}
