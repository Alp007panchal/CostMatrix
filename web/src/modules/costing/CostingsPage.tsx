import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { Async, Field } from '../../ui/Async'
import { longDate, money } from '../../lib/format'
import type { CostingStatus } from '../../lib/database.types'
import { createCosting, listCostings } from './api'

const STATUS_LABEL: Record<CostingStatus, string> = {
  draft: 'Draft',
  submitted: 'Awaiting approval',
  approved: 'Approved',
}

/** Every costing in the company, newest first. */
export function CostingsPage() {
  const { company, hasRole } = useSession()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const costings = useQuery({ queryKey: ['costings'], queryFn: listCostings })

  const [creating, setCreating] = useState(false)
  const [showOld, setShowOld] = useState(false)
  const canCreate = hasRole('costing_engineer') || hasRole('approver')

  if (!company) return null

  const rows = (costings.data ?? []).filter((c) => showOld || c.is_current)

  return (
    <>
      <div className="spread">
        <h1>Costings</h1>
        {canCreate && (
          <button className="primary" onClick={() => setCreating(true)}>
            New costing
          </button>
        )}
      </div>

      {creating && (
        <NewCostingForm
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            void queryClient.invalidateQueries({ queryKey: ['costings'] })
            navigate(`/costings/${id}`)
          }}
        />
      )}

      <div className="card">
        <div className="row end" style={{ marginBottom: '.5rem' }}>
          <label className="row" style={{ gap: '.35rem' }}>
            <input type="checkbox" checked={showOld} onChange={(e) => setShowOld(e.target.checked)} />
            Show superseded revisions
          </label>
        </div>
        <div className="table-wrap">
          <Async query={costings} empty="No costings yet. Create the first one.">
            {() => (
              <table>
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th className="right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr
                      key={c.id}
                      className={c.is_current ? undefined : 'inactive'}
                      style={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/costings/${c.id}`)}
                    >
                      <td>
                        {c.costing_no}
                        {c.revision_no > 0 && <span className="badge">Rev {c.revision_no}</span>}
                        {!c.is_current && <span className="badge">superseded</span>}
                      </td>
                      <td>{c.title}</td>
                      <td>
                        <span className="badge">{STATUS_LABEL[c.status]}</span>
                      </td>
                      <td className="muted">{longDate(c.created_at)}</td>
                      <td className="right">
                        {c.totals ? money(c.totals.grand_total, c.currency_label) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Async>
        </div>
      </div>
    </>
  )
}

function NewCostingForm({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const create = useMutation({
    mutationFn: () => createCosting(title.trim(), notes.trim() || null),
    onSuccess: (c) => onCreated(c.id),
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    create.mutate()
  }

  return (
    <form className="card" onSubmit={submit}>
      <div className="spread">
        <h2 style={{ marginTop: 0 }}>New costing</h2>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
      <p className="muted">
        Your company&rsquo;s current prices, rates, margins and VAT are copied in now and stay
        fixed for this costing, however they change later.
      </p>
      <Field label="Title" hint="the job, as you would say it: e.g. MCC for Triclover">
        <input value={title} required autoFocus onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Notes" hint="optional">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {create.error && <p className="error">{String(create.error)}</p>}
      <div className="row end">
        <button type="submit" className="primary" disabled={create.isPending}>
          {create.isPending ? 'Creating…' : 'Create costing'}
        </button>
      </div>
    </form>
  )
}
