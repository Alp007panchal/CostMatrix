import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { Async } from '../../ui/Async'
import { listQuotations } from '../quotation/api'
import { listFollowups, setFollowupDone } from './api'

/** What to chase, in date order: overdue first, then due, then done. */
export function FollowUpsPage() {
  const { hasRole } = useSession()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const followups = useQuery({ queryKey: ['followups'], queryFn: listFollowups })
  const quotations = useQuery({ queryKey: ['quotations'], queryFn: listQuotations })
  const canEdit = hasRole('costing_engineer') || hasRole('approver')
  const done = useMutation({
    mutationFn: (input: { id: string; done: boolean }) => setFollowupDone(input.id, input.done),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['followups'] }),
  })

  const today = new Date().toISOString().slice(0, 10)
  const quotation = (id: string) => quotations.data?.find((q) => q.id === id)

  return (
    <>
      <h1>Follow-ups</h1>
      <p className="muted">Reminders on quotations you have sent. Add one from the Quotations screen.</p>
      {done.error && <p className="error">{String(done.error)}</p>}
      <div className="card">
        <div className="table-wrap">
          <Async query={followups} empty="Nothing to chase.">
            {(rows) => {
              const open = rows.filter((f) => !f.done_at)
              const closed = rows.filter((f) => f.done_at)
              return (
                <table>
                  <thead><tr><th>Due</th><th>Quotation</th><th>Customer</th><th>Note</th><th className="right"></th></tr></thead>
                  <tbody>
                    {open.length === 0 && <tr><td colSpan={5} className="muted">Nothing outstanding.</td></tr>}
                    {[...open, ...closed].map((f) => {
                      const q = quotation(f.quotation_id)
                      const overdue = !f.done_at && f.due_on < today
                      return (
                        <tr key={f.id} className={f.done_at ? 'inactive' : undefined}>
                          <td className={overdue ? 'error' : undefined}>{f.due_on}{overdue && ' · overdue'}</td>
                          <td>{q ? <button style={{ padding: '.1rem .4rem' }} onClick={() => navigate(`/costings/${q.costing_id}`)}>{q.reference_no}</button> : '…'}</td>
                          <td>{q?.customer_name}</td>
                          <td>{f.note}</td>
                          <td className="right">
                            {canEdit && <button onClick={() => done.mutate({ id: f.id, done: !f.done_at })}>{f.done_at ? 'Reopen' : 'Done'}</button>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )
            }}
          </Async>
        </div>
      </div>
    </>
  )
}
