import { useSession } from '../auth/session'
import { money, percent, roleLabel, marginToMarkup } from '../../lib/format'

/** Where signing in lands you: who you are, and how your company is set up. */
export function HomePage() {
  const { profile, company, roles, isMasterAdmin } = useSession()
  if (!profile || !company) return null

  return (
    <>
      <h1>Good day, {profile.full_name.split(' ')[0]}</h1>
      <p className="muted">
        You are signed in to {company.name}
        {isMasterAdmin && ' as the master administrator'}.
      </p>

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
        Costing screens arrive in the next build slice. This one proves sign-in, roles and company
        separation work.
      </p>
    </>
  )
}
