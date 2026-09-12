import { useQuery } from '@tanstack/react-query'
import type { ApprovalReview } from '../../lib/database.types'
import { conditionSentence, factValue, verdictSentence } from '../admin/approval-rules'
import { approvalReview } from './api'

/**
 * Why this costing needs an approver — or does not (roadmap 2.5). It shows the
 * verdict, the rule that decided, and, when a company has written rules of its
 * own, every rule with the conditions that held and the figures they looked at.
 *
 * A company with only the default rule sees one sentence, because there is only
 * one thing to say.
 */
export function ApprovalPanel({ costingId, status }: { costingId: string; status: string }) {
  const review = useQuery({ queryKey: ['approval-review', costingId], queryFn: () => approvalReview(costingId) })
  if (!review.data) return null
  if (status === 'approved') return null

  const data: ApprovalReview = review.data
  const own = data.rules.filter((r) => r.conditions.length > 0)

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Approval</h2>
      <p className={data.outcome === 'block' ? 'error' : data.outcome === 'auto_approve' ? 'ok' : undefined}>
        {verdictSentence(data.outcome, data.rule_name)}
      </p>

      {own.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Rule</th><th>Holds?</th><th>What it looked at</th></tr></thead>
            <tbody>
              {data.rules.map((rule) => (
                <tr key={rule.rule_id} className={rule.holds ? undefined : 'inactive'}>
                  <td>
                    {rule.name}
                    {rule.decided && <span className="badge">decided</span>}
                  </td>
                  <td>{rule.conditions.length === 0 ? 'always' : rule.holds ? 'yes' : 'no'}</td>
                  <td className="muted" style={{ fontSize: '.8125rem' }}>
                    {rule.conditions.length === 0 ? (
                      '—'
                    ) : (
                      <ul style={{ margin: 0, paddingLeft: '1rem' }}>
                        {rule.conditions.map((c, i) => (
                          <li key={i}>
                            {conditionSentence(c)} — {c.holds ? 'yes' : 'no'}, it is{' '}
                            {factValue(c.field, c.actual)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
