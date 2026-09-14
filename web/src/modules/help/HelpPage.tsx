import { Link } from 'react-router-dom'
import { useSession } from '../auth/session'
import { GUIDES, guidesFor, isYours, type Guide } from './guides'
import { PageHeader } from '../../app/PageHeader'

const ROLE_NAMES: Record<string, string> = {
  costing_engineer: 'costing engineer',
  approver: 'approver',
  company_admin: 'company administrator',
}

function GuideCard({ guide, yours }: { guide: Guide; yours: boolean }) {
  return (
    <section className="card">
      <h2>
        {guide.title}
        {yours && <span className="muted"> — yours</span>}
      </h2>
      <p className="muted">
        {guide.blurb}
        {guide.role && !yours && ` (for the ${ROLE_NAMES[guide.role] ?? guide.role})`}
      </p>
      <ol>
        {guide.steps.map((step) => (
          <li key={step.action} style={{ marginBottom: '.75rem' }}>
            <div>{step.action}</div>
            <div className="muted">
              <Link to={step.where}>{step.screen}</Link>
              {step.note && ` — ${step.note}`}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

/**
 * A page each for the three roles, plus one everybody gets. Yours first.
 *
 * In the app rather than in the repository, because a guide nobody can find is
 * a guide nobody reads — and the people who need it most are the ones who have
 * never opened a repository.
 */
export function HelpPage() {
  const { roles, isMasterAdmin } = useSession()
  const ordered = guidesFor(roles, isMasterAdmin)
  const mine = GUIDES.filter((g) => isYours(g, roles, isMasterAdmin))

  return (
    <>
      <PageHeader title="How to use CostMatrix" meta={`${ordered.length} guides`} />
      <p className="intro">
        {mine.length > 0
          ? 'Your own guide is first. The others are here because most people end up doing a bit of everything.'
          : 'Nobody has given you a role yet, so here is all of it. Your administrator decides which parts you can use.'}{' '}
        What the app stores is on the <Link to="/terms">terms page</Link>.
      </p>

      {ordered.map((guide) => (
        <GuideCard key={guide.title} guide={guide} yours={isYours(guide, roles, isMasterAdmin)} />
      ))}

      <p className="muted">
        Anything this does not answer, ask your administrator — and if the app itself does
        something wrong, it has already recorded it; you do not have to report it.
      </p>
    </>
  )
}
