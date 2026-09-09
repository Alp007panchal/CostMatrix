import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { money, percent, roleLabel, marginToMarkup } from '../../lib/format'
import { listFollowups } from '../crm/api'

/** Where signing in lands you: what needs doing, who you are, how your company is set up. */
export function HomePage() {
  const { profile, company, roles, isMasterAdmin } = useSession()
  const followups = useQuery({ queryKey: ['followups'], queryFn: listFollowups })
  if (!profile || !company) return null

  const today = new Date().toISOString().slice(0, 10)
  const open = (followups.data ?? []).filter((f) => !f.done_at)
  const overdue = open.filter((f) => f.due_on < today)
  const dueSoon = open.filter((f) => f.due_on >= today).slice(0, 5)

  return (
    <>
      <h1>Good day, {profile.full_name.split(' ')[0]}</h1>
      <p className="muted">
        You are signed in to {company.name}
        {isMasterAdmin && ' as the master administrator'}.
      </p>

      {open.length > 0 && (
        <div className="card">
          <div className="spread">
            <h2 style={{ margin: 0 }}>Follow-ups</h2>
            <Link to="/crm/followups">All follow-ups</Link>
          </div>
          <p className="muted" style={{ margin: '.4rem 0 .6rem' }}>
            {overdue.length > 0 ? <strong className="error">{overdue.length} overdue</strong> : 'Nothing overdue'}
            {dueSoon.length > 0 && `, ${dueSoon.length} coming up`}.
          </p>
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {[...overdue, ...dueSoon].slice(0, 6).map((f) => (
              <li key={f.id}>
                <span className={f.due_on < today ? 'error' : 'muted'}>{f.due_on}</span> — {f.note || 'Chase the quotation'}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <div className="spread">
          <h2 style={{ margin: 0 }}>Your roles</h2>
        </div>
        {roles.length === 0 ? (
          <p className="muted">
            No roles yet, so there is not much you can do. Ask your company administrator.
          </p>
        ) : (
          <p>
            {roles.map((role) => (
              <span className="badge" key={role}>
                {roleLabel(role)}
              </span>
            ))}
          </p>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>How {company.name} is set up</h2>
        <div className="table-wrap">
          <table>
            <tbody>
              <tr>
                <th>Currency</th>
                <td>
                  {company.currency_label} ({company.currency_code})
                  {company.currency_code !== 'KES' &&
                    ` — 1 ${company.currency_code} = ${company.exchange_rate} KES`}
                </td>
              </tr>
              <tr>
                <th>Discount on master prices</th>
                <td>{percent(company.discount_pct)}</td>
              </tr>
              <tr>
                <th>Material margin</th>
                <td>
                  {percent(company.material_margin_pct)}{' '}
                  <span className="muted">
                    (a {percent(marginToMarkup(company.material_margin_pct))} markup on cost)
                  </span>
                </td>
              </tr>
              <tr>
                <th>Labour margin</th>
                <td>
                  {percent(company.labour_margin_pct)}{' '}
                  <span className="muted">
                    (a {percent(marginToMarkup(company.labour_margin_pct))} markup on cost)
                  </span>
                </td>
              </tr>
              <tr>
                <th>VAT</th>
                <td>{percent(company.tax_pct)}</td>
              </tr>
              <tr>
                <th>Panel prices rounded up to</th>
                <td>{money(company.price_rounding_step, company.currency_label)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p className="muted">
        Start with <Link to="/costings">Costings</Link>, or log a new request under{' '}
        <Link to="/crm/enquiries">Enquiries</Link>.
      </p>
    </>
  )
}
