import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Async } from '../../ui/Async'
import type { CompatibilityRule } from '../../lib/database.types'
import { listCompatibilityRules, saveCompatibilityRule } from './api'
import { KINDS, NUMBERS, numberProblem, ruleNumber, ruleSentence, ruleSource, withNumber } from './compatibility-rules'

/**
 * The compatibility checks (roadmap 3.4): the three questions the app asks about
 * a panel, as rows anybody can read. Each one can be switched off, its one
 * number changed, and made loud enough for an approval rule to act on.
 *
 * They are advisory by default: a warning appears under the panel name and no
 * price, hour or total moves. A check finds nothing until somebody has recorded
 * the sizes and the fittings it reads — the Components screen is where that is
 * done — so an untouched library sees no warnings at all, which is correct.
 */
export function CompatibilityRulesPage() {
  const queryClient = useQueryClient()
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const rules = useQuery({ queryKey: ['compatibility-rules'], queryFn: listCompatibilityRules })

  const save = useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: Partial<CompatibilityRule> }) =>
      saveCompatibilityRule(id, changes),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['compatibility-rules'] }),
  })

  return (
    <>
      <h1>Compatibility checks</h1>
      <p className="muted">
        Three questions the app asks about every panel. They are advisory: a note appears under the
        panel name and no price, hour or total changes. A check says nothing until the library holds
        what it reads — the depth of a device, the usable depth inside a cubicle, the devices a part
        is listed for — so an untouched catalogue produces no notes, which is the honest answer.
      </p>
      <p className="muted">
        A check marked <strong>blocker</strong> still changes nothing on its own. To make one stop a
        costing being submitted, write an approval rule on <em>Compatibility findings marked as
        blockers</em> on the Approval rules screen.
      </p>

      {save.error && <p className="error">{String(save.error)}</p>}

      <Async query={rules} empty="No checks yet.">
        {(list) => (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Check</th><th>Applies to</th><th>Setting</th><th>How loud</th><th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((rule) => {
                  const spec = NUMBERS[rule.rule_kind]
                  const typed = drafts[rule.id]
                  const value = typed === undefined ? String(ruleNumber(rule) ?? '') : typed
                  const problem = spec && typed !== undefined ? numberProblem(rule.rule_kind, Number(typed)) : null
                  return (
                    <tr key={rule.id} className={rule.is_active ? undefined : 'inactive'}>
                      <td>
                        <div><strong>{rule.name}</strong></div>
                        <div className="muted" style={{ fontSize: '.8125rem' }}>{ruleSentence(rule)}</div>
                        <div className="muted" style={{ fontSize: '.8125rem' }}>
                          {KINDS.find((k) => k.kind === rule.rule_kind)?.blurb}
                        </div>
                      </td>
                      <td className="muted">{ruleSource(rule)}</td>
                      <td>
                        {spec ? (
                          <>
                            <input
                              style={{ width: '6rem' }}
                              value={value}
                              onChange={(e) => setDrafts({ ...drafts, [rule.id]: e.target.value })}
                            />{' '}
                            {spec.unit}
                            {problem && <div className="error" style={{ fontSize: '.8125rem' }}>{problem}</div>}
                            {typed !== undefined && !problem && (
                              <div>
                                <button
                                  style={{ fontSize: '.8125rem', marginTop: '.3rem' }}
                                  onClick={() => {
                                    save.mutate({ id: rule.id, changes: { params: withNumber(rule, Number(typed)) } })
                                    setDrafts(Object.fromEntries(Object.entries(drafts).filter(([k]) => k !== rule.id)))
                                  }}
                                >
                                  Save
                                </button>
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="muted">Nothing to set</span>
                        )}
                      </td>
                      <td>
                        <select
                          value={rule.severity}
                          onChange={(e) =>
                            save.mutate({ id: rule.id, changes: { severity: e.target.value as CompatibilityRule['severity'] } })
                          }
                        >
                          <option value="warning">A note on the panel</option>
                          <option value="blocker">A blocker an approval rule can act on</option>
                        </select>
                      </td>
                      <td>
                        <button onClick={() => save.mutate({ id: rule.id, changes: { is_active: !rule.is_active } })}>
                          {rule.is_active ? 'Switch off' : 'Switch on'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Async>
    </>
  )
}
