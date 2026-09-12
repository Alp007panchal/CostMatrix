import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useSession } from '../auth/session'
import { Async } from '../../ui/Async'
import { money } from '../../lib/format'
import { listGroupOutcomes, listMarginAchieved, listPipeline, listSalesOutcomes } from './api'
import { SalesBreakdowns } from './SalesBreakdowns'
import { averageDaysToDecide, percent, pipelineSummary, restsOn, tally } from './sales'

/**
 * Sales analytics (roadmap 3.6): what was won, what was lost and why, the hit rate
 * by customer, product group, value and month, the margin achieved against the
 * margin quoted, and what is still out there.
 *
 * Every figure comes from a database view. Nothing on this screen writes anything,
 * and nothing here is recomputed from scratch — the grouping is in `sales.ts`,
 * which is unit-tested.
 */
export function SalesPage() {
  const { company } = useSession()
  const label = company?.currency_label ?? 'KES'

  const outcomes = useQuery({ queryKey: ['sales-outcomes'], queryFn: listSalesOutcomes })
  const groups = useQuery({ queryKey: ['sales-groups'], queryFn: listGroupOutcomes })
  const margins = useQuery({ queryKey: ['sales-margins'], queryFn: listMarginAchieved })
  const pipeline = useQuery({ queryKey: ['sales-pipeline'], queryFn: listPipeline })

  return (
    <>
      <h1>Sales</h1>
      <p className="muted">
        Won, lost and still out there — from the decisions recorded on enquiries and the costings
        behind them. Values are ex-VAT. A hit rate counts decided jobs only: a month with three
        offers still open is not a month with three losses.
      </p>

      <Async query={outcomes}>
        {(rows) => {
          const all = tally('Everything', rows)
          const days = averageDaysToDecide(rows)
          return (
            <>
              <div className="card">
                <div className="row" style={{ gap: '2rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div>
                    <div className="muted" style={{ fontSize: '.8125rem' }}>Hit rate</div>
                    <div style={{ fontSize: '3rem', lineHeight: 1.05, fontWeight: 650 }}>
                      {percent(all.hitRate)}
                    </div>
                    <div className="muted" style={{ fontSize: '.8125rem' }}>{restsOn(all)}</div>
                  </div>
                  <Tile label="Won" value={money(all.wonValue, label)} note={`${all.won} job${all.won === 1 ? '' : 's'}`} />
                  <Tile label="Lost" value={money(all.lostValue, label)} note={`${all.lost} job${all.lost === 1 ? '' : 's'}`} />
                  <Tile
                    label="Share by value"
                    value={percent(all.valueRate)}
                    note="of the decided value, won"
                  />
                  <Tile
                    label="Days to decide"
                    value={days === null ? '—' : String(days)}
                    note="average, on decided jobs"
                  />
                </div>
              </div>

              <Async query={pipeline}>
                {(open) => {
                  const p = pipelineSummary(open)
                  return (
                    <div className="card">
                      <div className="spread">
                        <h2 style={{ margin: 0 }}>Still out there</h2>
                        <span className="muted" style={{ fontSize: '.8125rem' }}>
                          {money(p.value, label)} across {p.jobs} job{p.jobs === 1 ? '' : 's'} ·{' '}
                          {p.withCustomer} with the customer
                          {p.runOut > 0 && ` · ${p.runOut} run out`}
                        </span>
                      </div>
                      <div className="table-wrap" style={{ marginTop: '.5rem' }}>
                        <table>
                          <thead>
                            <tr>
                              <th>Enquiry</th><th>Customer</th><th className="right">Value</th>
                              <th className="right">Age</th><th>Offer</th><th className="right">Valid</th>
                            </tr>
                          </thead>
                          <tbody>
                            {open.map((r) => (
                              <tr key={r.enquiry_id}>
                                <td>
                                  <Link to={`/crm/enquiries/${r.enquiry_id}`}>{r.enquiry_no}</Link>
                                  <div className="muted" style={{ fontSize: '.75rem' }}>{r.title}</div>
                                </td>
                                <td>{r.customer_name}</td>
                                <td className="right">
                                  {r.value_ex_vat === null
                                    ? <span className="muted">not costed</span>
                                    : money(Number(r.value_ex_vat), label)}
                                </td>
                                <td className="right">{r.age_days} d</td>
                                <td>
                                  {r.latest_quotation ?? <span className="muted">nothing out</span>}
                                  {r.quotation_status && (
                                    <div className="muted" style={{ fontSize: '.75rem' }}>{r.quotation_status}</div>
                                  )}
                                </td>
                                <td className="right">
                                  {r.days_left === null
                                    ? <span className="muted">—</span>
                                    : r.has_run_out
                                      ? <span className="error">ran out</span>
                                      : `${r.days_left} d`}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {open.length === 0 && <p className="empty">Nothing open — every enquiry has been decided.</p>}
                    </div>
                  )
                }}
              </Async>

              <SalesBreakdowns
                outcomes={rows}
                groups={groups.data ?? []}
                margins={margins.data ?? []}
                currencyLabel={label}
              />
            </>
          )
        }}
      </Async>
    </>
  )
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: '.8125rem' }}>{label}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 650 }}>{value}</div>
      <div className="muted" style={{ fontSize: '.75rem' }}>{note}</div>
    </div>
  )
}
