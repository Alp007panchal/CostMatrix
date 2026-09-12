import { money } from '../../lib/format'
import type { MarginAchieved, SalesGroupOutcome, SalesOutcome } from '../../lib/database.types'
import { Dumbbell, Meter } from './Marks'
import {
  byBand, byCustomer, byKitGroup, byMonth, lostReasons, marginDomain, percent, restsOn,
  type Tally,
} from './sales'

/** The four ways the hit rate is read, why jobs were lost, and the margins (3.6). */
export function SalesBreakdowns({
  outcomes, groups, margins, currencyLabel,
}: {
  outcomes: SalesOutcome[]
  groups: SalesGroupOutcome[]
  margins: MarginAchieved[]
  currencyLabel: string
}) {
  const reasons = lostReasons(outcomes)
  const kitGroups = byKitGroup(groups)
  const measured = margins.filter((m) => m.labour_measured_pct > 0)
  const domain = marginDomain(measured.flatMap((m) => [m.margin_quoted_pct, m.margin_achieved_pct]))

  return (
    <>
      <TallyTable title="By customer" rows={byCustomer(outcomes)} label={currencyLabel} first="Customer" />
      <TallyTable title="By value" rows={byBand(outcomes)} label={currencyLabel} first="Value band" />
      <TallyTable title="By month" rows={byMonth(outcomes)} label={currencyLabel} first="Month" />

      <div className="card">
        <h2 style={{ marginTop: 0 }}>By product group</h2>
        <p className="muted" style={{ fontSize: '.8125rem', marginTop: 0 }}>
          A job counts towards every kit group it used, with what that group came to on it — so the
          money at stake sits beside the hit rate. Biggest by material first.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Kit group</th><th className="right">Jobs</th><th className="right">Won</th>
                <th className="right">Lost</th><th>Hit rate</th><th className="right">Material</th>
                <th className="right">Hours</th>
              </tr>
            </thead>
            <tbody>
              {kitGroups.map((g) => (
                <tr key={g.kitGroup}>
                  <td>{g.kitGroup}</td>
                  <td className="right">{g.jobs}</td>
                  <td className="right">{g.won}</td>
                  <td className="right">{g.lost}</td>
                  <td>
                    <Meter value={g.hitRate} title={`${g.won} of ${g.won + g.lost} decided`} />{' '}
                    <span className="muted" style={{ fontSize: '.8125rem' }}>{percent(g.hitRate)}</span>
                  </td>
                  <td className="right">{money(g.material, currencyLabel)}</td>
                  <td className="right">{g.hours.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {kitGroups.length === 0 && <p className="empty">No costed jobs yet.</p>}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Why jobs were lost</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Reason, as it was heard</th><th className="right">Jobs</th><th className="right">Value</th></tr>
            </thead>
            <tbody>
              {reasons.map((r) => (
                <tr key={r.reason}>
                  <td>{r.reason}</td>
                  <td className="right">{r.jobs}</td>
                  <td className="right">{money(r.value, currencyLabel)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {reasons.length === 0 && <p className="empty">Nothing lost yet.</p>}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Margin quoted, margin achieved</h2>
        <p className="muted" style={{ fontSize: '.8125rem', marginTop: 0 }}>
          The same arithmetic with the hours the shop recorded in place of the estimate. The hollow
          dot is what was quoted, the solid one what was achieved. <strong>Measured</strong> says how
          much of that job&rsquo;s labour is recorded fact — read a row with one eye on it.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Costing</th><th>Quoted → achieved</th><th className="right">Quoted</th>
                <th className="right">Achieved</th><th className="right">Hours</th><th>Measured</th>
              </tr>
            </thead>
            <tbody>
              {measured.map((m) => (
                <tr key={m.costing_id}>
                  <td>
                    {m.costing_no}{m.revision_no > 0 && <span className="badge" style={{ marginLeft: '.3rem' }}>rev {m.revision_no}</span>}
                    <div className="muted" style={{ fontSize: '.75rem' }}>{money(m.price_ex_vat, currencyLabel)} ex-VAT</div>
                  </td>
                  <td>
                    <Dumbbell
                      from={m.margin_quoted_pct}
                      to={m.margin_achieved_pct}
                      domain={domain}
                      title={`quoted ${m.margin_quoted_pct} %, achieved ${m.margin_achieved_pct} %`}
                    />
                  </td>
                  <td className="right">{m.margin_quoted_pct}&thinsp;%</td>
                  <td className="right">
                    <strong>{m.margin_achieved_pct}&thinsp;%</strong>
                  </td>
                  <td className="right">
                    {Number(m.hours_achieved).toFixed(1)}
                    <div className="muted" style={{ fontSize: '.75rem' }}>
                      quoted {Number(m.hours_quoted).toFixed(1)}
                    </div>
                  </td>
                  <td>
                    <Meter value={m.labour_measured_pct / 100} title={`${m.labour_measured_pct} % of the labour is recorded`} />{' '}
                    <span className="muted" style={{ fontSize: '.8125rem' }}>{m.labour_measured_pct}&thinsp;%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {measured.length === 0 && (
          <p className="empty">
            No hours recorded against a job yet. Record them on a costing, under “Hours actually
            worked”, and this table fills in.
          </p>
        )}
      </div>
    </>
  )
}

function TallyTable({
  title, rows, label, first,
}: {
  title: string
  rows: Tally[]
  label: string
  first: string
}) {
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{first}</th><th className="right">Jobs</th><th className="right">Won</th>
              <th className="right">Lost</th><th className="right">Open</th>
              <th>Hit rate</th><th className="right">Won value</th><th className="right">Lost value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.label}>
                <td>{t.label}</td>
                <td className="right">{t.quoted}</td>
                <td className="right">{t.won}</td>
                <td className="right">{t.lost}</td>
                <td className="right">{t.open}</td>
                <td>
                  <Meter value={t.hitRate} title={restsOn(t)} />{' '}
                  <span className="muted" style={{ fontSize: '.8125rem' }}>{percent(t.hitRate)}</span>
                  <div className="muted" style={{ fontSize: '.75rem' }}>{restsOn(t)}</div>
                </td>
                <td className="right">{money(t.wonValue, label)}</td>
                <td className="right">{money(t.lostValue, label)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="empty">Nothing to show yet.</p>}
    </div>
  )
}
