import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { Async } from '../../ui/Async'
import { roleLabel } from '../../lib/format'
import type { PersonWithRoles, UserRole } from '../../lib/database.types'
import { grantRole, listPeople, movePerson, removePerson, revokeRole, setPersonActive } from './api'
import { CompanyFilterSelect, useCompanyFilter } from '../../ui/CompanyFilter'
import { InviteForm } from './InviteForm'

const ALL_ROLES: UserRole[] = ['company_admin', 'costing_engineer', 'approver']

/** Who is in this company, what they may do, and how to invite somebody new. */
export function PeoplePage() {
  const { company, isMasterAdmin } = useSession()
  const queryClient = useQueryClient()
  const people = useQuery({ queryKey: ['people'], queryFn: () => listPeople() })
  const byCompany = useCompanyFilter()

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

  const move = useMutation({
    mutationFn: (input: { userId: string; companyId: string }) =>
      movePerson(input.userId, input.companyId),
    onSuccess: refresh,
  })

  const remove = useMutation({
    mutationFn: (userId: string) => removePerson(userId),
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

      {(toggleRole.error || toggleActive.error || move.error || remove.error) && (
        <p className="error">
          {String(toggleRole.error ?? toggleActive.error ?? move.error ?? remove.error)}
        </p>
      )}

      <div className="card">
        {byCompany.multi && <div className="row end" style={{ marginBottom: '.5rem' }}><CompanyFilterSelect filter={byCompany} /></div>}
        <div className="table-wrap">
          <Async query={people} empty="Nobody here yet.">
            {(all) => (
              <table>
                <thead>
                  <tr>
                    {byCompany.multi && <th>Company</th>}
                    <th>Name</th>
                    <th>Email</th>
                    {ALL_ROLES.map((role) => (
                      <th key={role}>{roleLabel(role)}</th>
                    ))}
                    <th className="right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {all.filter((p) => byCompany.keep(p.company_id)).map((person) => (
                    <tr key={person.id} className={person.is_active ? undefined : 'inactive'}>
                      {byCompany.multi && <td className="muted">{byCompany.companyName(person.company_id)}</td>}
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
                        </button>{' '}
                        <MistakeButtons
                          person={person}
                          canCorrect={isMasterAdmin}
                          companies={byCompany.companies}
                          busy={move.isPending || remove.isPending}
                          onMove={(companyId) => move.mutate({ userId: person.id, companyId })}
                          onRemove={() => remove.mutate(person.id)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Async>
        </div>
        <p className="muted" style={{ fontSize: '.8125rem' }}>
          People who have built or approved anything are deactivated, never deleted: their name
          stays attached to that work. Somebody invited by mistake, who has done nothing yet, the
          master administrator can still move to another company or remove.
        </p>
      </div>

      <InviteForm companyId={company.id} companies={byCompany.multi ? byCompany.companies : []} onInvited={refresh} />
    </>
  )
}

/**
 * Undoing an invitation. Shown only to the master administrator, and only while
 * the person has no records at all: after that their name belongs on their work
 * and Deactivate is the only honest option.
 */
function MistakeButtons({
  person,
  canCorrect,
  companies,
  busy,
  onMove,
  onRemove,
}: {
  person: PersonWithRoles
  canCorrect: boolean
  companies: { id: string; name: string }[]
  busy: boolean
  onMove: (companyId: string) => void
  onRemove: () => void
}) {
  const [moving, setMoving] = useState(false)
  const elsewhere = companies.filter((c) => c.id !== person.company_id)

  if (!canCorrect || person.is_master_admin) return null
  if (person.records === undefined) return null
  if (person.records > 0) {
    return (
      <span className="muted" title={`${person.records} record(s) name them, so they stay.`}>
        {' '}has records
      </span>
    )
  }

  if (moving) {
    return (
      <>
        {' '}
        <select
          defaultValue=""
          style={{ width: 'auto' }}
          onChange={(e) => {
            if (e.target.value) {
              onMove(e.target.value)
              setMoving(false)
            }
          }}
        >
          <option value="">Move to…</option>
          {elsewhere.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>{' '}
        <button onClick={() => setMoving(false)}>Cancel</button>
      </>
    )
  }

  return (
    <>
      {elsewhere.length > 0 && (
        <button disabled={busy} onClick={() => setMoving(true)} title="They have no records yet">
          Move…
        </button>
      )}{' '}
      <button
        className="danger"
        disabled={busy}
        title="They have no records yet"
        onClick={() => {
          const sure = window.confirm(
            `Remove ${person.full_name}? Their login is deleted for good. ` +
              'This is only possible because they have not built or approved anything.',
          )
          if (sure) onRemove()
        }}
      >
        Remove
      </button>
    </>
  )
}
