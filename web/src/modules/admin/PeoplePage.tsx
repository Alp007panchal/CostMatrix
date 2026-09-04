import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { Async, Field } from '../../ui/Async'
import { roleLabel } from '../../lib/format'
import type { UserRole } from '../../lib/database.types'
import { grantRole, invitePerson, listPeople, revokeRole, setPersonActive } from './api'

const ALL_ROLES: UserRole[] = ['company_admin', 'costing_engineer', 'approver']

/** Who is in this company, what they may do, and how to invite somebody new. */
export function PeoplePage() {
  const { company } = useSession()
  const queryClient = useQueryClient()
  const people = useQuery({ queryKey: ['people'], queryFn: () => listPeople() })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['people'] })

  const toggleRole = useMutation({
    mutationFn: async (input: { userId: string; companyId: string; role: UserRole; had: boolean }) =>
      input.had
        ? revokeRole(input.userId, input.role)
        : grantRole(input.userId, input.companyId, input.role),
    onSuccess: refresh,
  })

  const toggleActive = useMutation({
    mutationFn: (input: { userId: string; isActive: boolean }) =>
      setPersonActive(input.userId, input.isActive),
    onSuccess: refresh,
  })

  if (!company) return null

  return (
    <>
      <h1>People</h1>
      <p className="muted">
        Roles decide what someone may do. Only an approver can approve a costing or release a
        quotation, and that is enforced by the database, not just by this screen.
      </p>

      {(toggleRole.error || toggleActive.error) && (
        <p className="error">{String(toggleRole.error ?? toggleActive.error)}</p>
      )}

      <div className="card">
        <div className="table-wrap">
          <Async query={people} empty="Nobody here yet.">
            {(rows) => (
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    {ALL_ROLES.map((role) => (
                      <th key={role}>{roleLabel(role)}</th>
                    ))}
                    <th className="right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((person) => (
                    <tr key={person.id} className={person.is_active ? undefined : 'inactive'}>
                      <td>
                        {person.full_name}
                        {person.is_master_admin && <span className="badge">Master admin</span>}
                      </td>
                      <td>{person.email}</td>
                      {ALL_ROLES.map((role) => {
                        const had = person.roles.includes(role)
                        return (
                          <td key={role}>
                            <input
                              type="checkbox"
                              checked={had}
                              aria-label={`${roleLabel(role)} for ${person.full_name}`}
                              onChange={() =>
                                toggleRole.mutate({
                                  userId: person.id,
                                  companyId: person.company_id,
                                  role,
                                  had,
                                })
                              }
                            />
                          </td>
                        )
                      })}
                      <td className="right">
                        <button
                          onClick={() =>
                            toggleActive.mutate({
                              userId: person.id,
                              isActive: !person.is_active,
                            })
                          }
                        >
                          {person.is_active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Async>
        </div>
        <p className="muted" style={{ fontSize: '.8125rem' }}>
          People are deactivated, never deleted: their name stays attached to the costings they
          built.
        </p>
      </div>

      <InviteForm companyId={company.id} onInvited={refresh} />
    </>
  )
}

function InviteForm({ companyId, onInvited }: { companyId: string; onInvited: () => void }) {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [roles, setRoles] = useState<UserRole[]>(['costing_engineer'])
  const [sent, setSent] = useState<string | null>(null)

  const invite = useMutation({
    mutationFn: () => invitePerson({ email, full_name: fullName, company_id: companyId, roles }),
    onSuccess: () => {
      setSent(`An invitation is on its way to ${email}.`)
      setEmail('')
      setFullName('')
      onInvited()
    },
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    setSent(null)
    invite.mutate()
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2 style={{ marginTop: 0 }}>Invite somebody</h2>
      <p className="muted">
        They receive an email with a link to set their own password. Nobody can sign themselves up.
      </p>

      <Field label="Full name">
        <input value={fullName} required onChange={(e) => setFullName(e.target.value)} />
      </Field>
      <Field label="Email">
        <input type="email" value={email} required onChange={(e) => setEmail(e.target.value)} />
      </Field>

      <div className="field">
        <span>Roles</span>
        <div className="row">
          {ALL_ROLES.map((role) => (
            <label key={role} className="row" style={{ gap: '.35rem' }}>
              <input
                type="checkbox"
                checked={roles.includes(role)}
                onChange={(e) =>
                  setRoles((current) =>
                    e.target.checked ? [...current, role] : current.filter((r) => r !== role),
                  )
                }
              />
              {roleLabel(role)}
            </label>
          ))}
        </div>
      </div>

      {invite.error && <p className="error">{String(invite.error)}</p>}
      {sent && <p className="ok">{sent}</p>}

      <div className="row end">
        <button type="submit" className="primary" disabled={invite.isPending}>
          {invite.isPending ? 'Sending…' : 'Send invitation'}
        </button>
      </div>
    </form>
  )
}
