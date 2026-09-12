import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { Async, Field } from '../../ui/Async'
import type { ApprovalRule } from '../../lib/database.types'
import { listApprovalRules, removeApprovalRule, saveApprovalRule } from './api'
import {
  FACTS, OPERATORS, OUTCOMES, ruleProblem, ruleSentence, toCondition, toRows,
  type ApprovalOutcome,
} from './approval-rules'

/**
 * When does a costing need a second pair of eyes? (roadmap 2.5) The rules are
 * read in order and the first whose conditions all hold decides. Every company
 * starts with one — "Always require an approver" — which is what the app did
 * before rules existed, so a company that writes none notices no change.
 */
export function ApprovalRulesPage() {
  const { company } = useSession()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<ApprovalRule | 'new' | null>(null)
  const companyId = company?.id

  const rules = useQuery({
    queryKey: ['approval-rules', companyId],
    queryFn: () => listApprovalRules(companyId as string),
    enabled: Boolean(companyId),
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['approval-rules', companyId] })

  const remove = useMutation({
    mutationFn: (id: string) => removeApprovalRule(id),
    onSuccess: () => void refresh(),
  })
  const toggle = useMutation({
    mutationFn: (rule: ApprovalRule) =>
      saveApprovalRule({ ...rule, is_active: !rule.is_active }),
    onSuccess: () => void refresh(),
  })

  if (!company) return null

  return (
    <>
      <h1>Approval rules</h1>
      <p className="muted">
        Read in order, top to bottom; the first rule whose conditions all hold decides what happens
        when a costing is submitted. If none holds, an approver is required — so switching every rule
        off does not make costings approve themselves. The costing screen shows which rule decided
        and why.
      </p>

      {remove.error && <p className="error">{String(remove.error)}</p>}
      {toggle.error && <p className="error">{String(toggle.error)}</p>}

      <Async query={rules} empty="No rules yet.">
        {(list) => (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Order</th><th>Rule</th><th>What it does</th><th></th></tr>
              </thead>
              <tbody>
                {list.map((rule) => (
                  <tr key={rule.id} className={rule.is_active ? undefined : 'inactive'}>
                    <td className="muted">{rule.sort_order}</td>
                    <td>
                      <div><strong>{rule.name}</strong></div>
                      <div className="muted" style={{ fontSize: '.8125rem' }}>{ruleSentence(rule)}</div>
                    </td>
                    <td>{rule.is_active ? <span className="badge">in force</span> : <span className="muted">switched off</span>}</td>
                    <td className="right">
                      <button style={{ padding: '.1rem .4rem' }} onClick={() => setEditing(rule)}>Edit</button>{' '}
                      <button style={{ padding: '.1rem .4rem' }} onClick={() => toggle.mutate(rule)}>
                        {rule.is_active ? 'Switch off' : 'Switch on'}
                      </button>{' '}
                      <button
                        className="danger" style={{ padding: '.1rem .4rem' }}
                        onClick={() => { if (confirm(`Remove "${rule.name}"?`)) remove.mutate(rule.id) }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Async>

      {editing === null && (
        <button className="primary" style={{ marginTop: '.75rem' }} onClick={() => setEditing('new')}>
          + Add a rule
        </button>
      )}

      {editing !== null && (
        <RuleForm
          rule={editing === 'new' ? null : editing}
          companyId={company.id}
          nextOrder={((rules.data ?? []).at(-1)?.sort_order ?? 0) + 10}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void refresh() }}
        />
      )}
    </>
  )
}

function RuleForm({
  rule,
  companyId,
  nextOrder,
  onClose,
  onSaved,
}: {
  rule: ApprovalRule | null
  companyId: string
  nextOrder: number
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(rule?.name ?? '')
  const [outcome, setOutcome] = useState<ApprovalOutcome>(rule?.outcome ?? 'require_approver')
  const [order, setOrder] = useState(String(rule?.sort_order ?? nextOrder))
  const [rows, setRows] = useState(rule ? toRows(rule.condition) : [])
  const [problem, setProblem] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: () =>
      saveApprovalRule({
        ...(rule ? { id: rule.id } : {}),
        company_id: companyId,
        name: name.trim(),
        condition: toCondition(rows),
        outcome,
        sort_order: Number(order) || 0,
        is_active: rule?.is_active ?? true,
      }),
    onSuccess: onSaved,
  })

  const submit = () => {
    const said = ruleProblem({ name, condition: rows })
    setProblem(said)
    if (!said) save.mutate()
  }

  const setRow = (i: number, changes: Partial<{ field: string; op: string; value: string }>) =>
    setRows((rs) => rs.map((r, j) => (i === j ? { ...r, ...changes } : r)))

  return (
    <div className="card">
      <div className="spread">
        <h2 style={{ marginTop: 0 }}>{rule ? `Edit "${rule.name}"` : 'A new rule'}</h2>
        <button onClick={onClose}>Cancel</button>
      </div>

      <Field label="Name" hint="what the history will say decided">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Small jobs approve themselves" />
      </Field>

      <p className="muted" style={{ fontSize: '.8125rem', margin: '.4rem 0' }}>
        Conditions — <strong>all</strong> of them must hold. A rule with none always holds, which is
        what the default rule is.
      </p>
      {rows.map((row, i) => (
        <div className="row" key={i} style={{ alignItems: 'flex-end' }}>
          <select
            aria-label={`Fact ${i + 1}`}
            style={{ flex: 2, minWidth: '12rem' }}
            value={row.field}
            onChange={(e) => setRow(i, { field: e.target.value })}
          >
            {FACTS.map((f) => <option key={f.field} value={f.field}>{f.label}</option>)}
          </select>
          <select
            aria-label={`Comparison ${i + 1}`}
            style={{ width: '8rem' }}
            value={row.op}
            onChange={(e) => setRow(i, { op: e.target.value })}
          >
            {OPERATORS.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
          </select>
          {FACTS.find((f) => f.field === row.field)?.kind === 'yes_no' ? (
            <select
              aria-label={`Value ${i + 1}`}
              style={{ width: '6rem' }}
              value={row.value}
              onChange={(e) => setRow(i, { value: e.target.value })}
            >
              <option value="true">yes</option>
              <option value="false">no</option>
            </select>
          ) : (
            <input
              aria-label={`Value ${i + 1}`}
              style={{ width: '9rem' }}
              value={row.value}
              onChange={(e) => setRow(i, { value: e.target.value })}
            />
          )}
          <button className="danger" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      <button
        style={{ marginTop: '.4rem' }}
        onClick={() => setRows((rs) => [...rs, { field: 'total_ex_vat', op: '<', value: '' }])}
      >
        + Add a condition
      </button>

      <div className="row" style={{ alignItems: 'flex-end', marginTop: '.75rem' }}>
        <div style={{ flex: 2, minWidth: '14rem' }}>
          <Field label="Then">
            <select value={outcome} onChange={(e) => setOutcome(e.target.value as ApprovalOutcome)}>
              {OUTCOMES.map((o) => <option key={o.outcome} value={o.outcome}>{o.label} — {o.blurb}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ width: '8rem' }}>
          <Field label="Order" hint="lower first">
            <input type="number" step="1" value={order} onChange={(e) => setOrder(e.target.value)} />
          </Field>
        </div>
      </div>

      <p className="muted">
        Reads as: <strong>{ruleSentence({ condition: toCondition(rows), outcome })}</strong>
      </p>

      {problem && <p className="error">{problem}</p>}
      {save.error && <p className="error">{String(save.error)}</p>}
      <div className="row end">
        <button className="primary" disabled={save.isPending} onClick={submit}>
          {save.isPending ? 'Saving…' : 'Save the rule'}
        </button>
      </div>
    </div>
  )
}
