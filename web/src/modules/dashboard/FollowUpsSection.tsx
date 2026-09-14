import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listFollowups } from '../crm/api'
import { listQuotations } from '../quotation/api'
import { longDate } from '../../lib/format'
import { todayIso } from './attention'

/**
 * Section 2 of the home page: the follow-ups that are late or fall in the next
 * seven days (house style §5).
 *
 * Overdue ones come first however far ahead the rest are — a reminder that has
 * already been missed is not "this week's work", it is today's.
 */
export function FollowUpsSection() {
  const followups = useQuery({ queryKey: ['followups'], queryFn: listFollowups })
  const quotations = useQuery({ queryKey: ['quotations'], queryFn: listQuotations })
  const today = todayIso()
  const week = new Date(Date.parse(today) + 7 * 86_400_000).toISOString().slice(0, 10)

  const open = (followups.data ?? []).filter((f) => f.done_at === null)
  const shown = open
    .filter((f) => f.due_on <= week)
    .slice()
    .sort((a, b) => a.due_on.localeCompare(b.due_on))
    .slice(0, 6)
  if (shown.length === 0) return null

  const quotation = (id: string) => (quotations.data ?? []).find((q) => q.id === id)

  return (
    <div className="section">
      <div className="section-head">
        <span className="n">2</span>
        <span className="sd ok" />
        <h2>Follow-ups this week</h2>
        <Link className="q" to="/crm/follow-ups">
          all {open.length} open
        </Link>
      </div>
      <div className="panel">
        {shown.map((f) => {
          const q = quotation(f.quotation_id)
          const late = f.due_on < today
          return (
            <div className="alert-item" key={f.id}>
              <span className={late ? 'alert-dot bad' : 'alert-dot warn'} />
              <div>
                {q === undefined ? 'Chase the quotation' : `${q.customer_name} · ${f.note ?? 'chase it'}`}
                <span className="t">
                  {q?.reference_no ?? '—'} ·{' '}
                  {late ? `OVERDUE SINCE ${longDate(f.due_on).toUpperCase()}` : longDate(f.due_on).toUpperCase()}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
