import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { Async, Field } from '../../ui/Async'
import { getAssistantOptions, getUsage, setAssistantOption } from './api'

/**
 * The company's assistant settings and what it has used (AI spec §6.4, §8).
 *
 * Two kinds of setting, and the database decides which is whose: the master
 * administrator alone may switch the assistant on or off for a company
 * (a trigger refuses anyone else), while the company's own administrator sets
 * the budget and the two thresholds.
 */
export function AssistantSettingsPage() {
  const { company, isMasterAdmin } = useSession()
  const queryClient = useQueryClient()
  const companyId = company?.id
  const options = useQuery({
    queryKey: ['assistant-options', companyId],
    queryFn: () => getAssistantOptions(companyId as string),
    enabled: Boolean(companyId),
  })
  const usage = useQuery({ queryKey: ['assistant-usage'], queryFn: getUsage })
  const [saved, setSaved] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) => setAssistantOption(companyId as string, key, value),
    onSuccess: async (_result, variables) => {
      setSaved(variables.key)
      await queryClient.invalidateQueries({ queryKey: ['assistant-options', companyId] })
      await queryClient.invalidateQueries({ queryKey: ['assistant-usage'] })
      await queryClient.invalidateQueries({ queryKey: ['assistant-allowance'] })
    },
  })

  if (!company) return null

  return (
    <>
      <h1>Assistant</h1>
      <Async query={options}>
        {(o) => {
          const enabled = o['ai_enabled'] === true
          const num = (key: string, fallback: number) => (typeof o[key] === 'number' ? (o[key] as number) : fallback)
          return (
            <div className="card">
              <div className="spread">
                <div>
                  <h2 style={{ margin: 0 }}>{enabled ? 'Switched on' : 'Switched off'}</h2>
                  <p className="muted" style={{ margin: '.3rem 0 0' }}>
                    {enabled
                      ? 'Costing engineers and approvers see the Assistant panel on enquiries and costings.'
                      : 'Nobody sees the Assistant panel, and no request reaches the model.'}
                  </p>
                </div>
                {isMasterAdmin ? (
                  <button
                    className={enabled ? 'danger' : 'primary'}
                    disabled={save.isPending}
                    onClick={() => save.mutate({ key: 'ai_enabled', value: !enabled })}
                  >
                    {enabled ? 'Switch off' : 'Switch on'}
                  </button>
                ) : (
                  <span className="muted" style={{ fontSize: '.8125rem' }}>
                    Only the master administrator changes this.
                  </span>
                )}
              </div>

              <h2>What it may spend</h2>
              <Field label="Monthly token budget" hint="the whole company, resets on the 1st; 0 stops the assistant">
                <input
                  type="number" min="0" step="100000" style={{ maxWidth: '12rem' }}
                  defaultValue={num('ai_monthly_token_budget', 0)}
                  onBlur={(e) => {
                    const value = Number(e.target.value)
                    if (value !== num('ai_monthly_token_budget', 0)) save.mutate({ key: 'ai_monthly_token_budget', value })
                  }}
                />
              </Field>
              <p className="muted" style={{ fontSize: '.8125rem', marginTop: '-.5rem' }}>
                A draft from a ten-page specification costs roughly 30,000 to 60,000 tokens; a review 10,000 to 20,000.
                A warning appears at 80 % and the assistant stops at 100 %.
              </p>

              <h2>What it warns about</h2>
              <Field label="Price-age warning, in days" hint="a review flags a line whose price is older than this">
                <input
                  type="number" min="0" step="1" style={{ maxWidth: '8rem' }}
                  defaultValue={num('ai_price_age_warning_days', 90)}
                  onBlur={(e) => {
                    const value = Number(e.target.value)
                    if (value !== num('ai_price_age_warning_days', 90)) save.mutate({ key: 'ai_price_age_warning_days', value })
                  }}
                />
              </Field>
              <Field label="Minimum margin %" hint="a review flags a costing below this">
                <input
                  type="number" min="0" max="99" step="0.1" style={{ maxWidth: '8rem' }}
                  defaultValue={num('ai_min_margin_pct', 0)}
                  onBlur={(e) => {
                    const value = Number(e.target.value)
                    if (value !== num('ai_min_margin_pct', 0)) save.mutate({ key: 'ai_min_margin_pct', value })
                  }}
                />
              </Field>

              {save.error && <p className="error">{String(save.error)}</p>}
              {saved && !save.error && !save.isPending && <p className="ok">Saved.</p>}
              <p className="muted" style={{ fontSize: '.8125rem' }}>
                The assistant runs on Anthropic's API. Documents and costing figures are sent only for the
                company whose user asked and only for the record open on screen; Anthropic does not train
                on data sent through its API. The key itself is held on Supabase, never in this app.
              </p>
            </div>
          )
        }}
      </Async>

      <Async query={usage}>
        {(u) => (
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Usage</h2>
            <p className="muted">
              {u.allowance.used_this_month.toLocaleString()} of {u.allowance.monthly_token_budget.toLocaleString()} tokens
              this month{u.cost_usd_this_month > 0 && ` · about US$ ${u.cost_usd_this_month.toFixed(2)}`}
            </p>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Month</th><th className="right">Answers</th><th className="right">Tokens in</th><th className="right">Tokens out</th><th className="right">Conversations</th></tr></thead>
                <tbody>
                  {u.months.map((m) => (
                    <tr key={m.month}>
                      <td>{m.month}</td>
                      <td className="right">{m.turns}</td>
                      <td className="right">{m.tokens_in.toLocaleString()}</td>
                      <td className="right">{m.tokens_out.toLocaleString()}</td>
                      <td className="right">{m.conversations}</td>
                    </tr>
                  ))}
                  {u.months.length === 0 && <tr><td colSpan={5} className="muted">Nothing yet.</td></tr>}
                </tbody>
              </table>
            </div>

            {u.by_user_this_month.length > 0 && (
              <>
                <h2>Who used it this month</h2>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Person</th><th className="right">Answers</th><th className="right">Tokens</th></tr></thead>
                    <tbody>
                      {u.by_user_this_month.map((p) => (
                        <tr key={p.user_id}>
                          <td>{p.name ?? '—'}</td>
                          <td className="right">{p.turns}</td>
                          <td className="right">{p.tokens.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <h2>Proposals</h2>
            <p className="muted">
              {Object.entries(u.proposals).length === 0
                ? 'None yet.'
                : Object.entries(u.proposals).map(([status, n]) => `${n} ${status.replace('_', ' ')}`).join(' · ')}
            </p>
          </div>
        )}
      </Async>
    </>
  )
}
