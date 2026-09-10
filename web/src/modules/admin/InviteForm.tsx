import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Field } from '../../ui/Async'
import { roleLabel } from '../../lib/format'
import type { UserRole } from '../../lib/database.types'
import { invitePerson } from './api'

const ALL_ROLES: UserRole[] = ['company_admin', 'costing_engineer', 'approver']

/** Invite somebody into a company. The email becomes their login, so one
 *  address belongs to one company: inviting an address twice is refused. */
export function InviteForm({ companyId, companies, onInvited }: { companyId: string; companies: { id: string; name: string }[]; onInvited: () => void }) {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [target, setTarget] = useState(companyId)
  const [roles, setRoles] = useState<UserRole[]>(['costing_engineer'])
  const [sent, setSent] = useState<string | null>(null)

  const invite = useMutation({
    mutationFn: () => invitePerson({ email, full_name: fullName, company_id: target, roles }),
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

      {companies.length > 0 && (
        <Field label="Company" hint="the master administrator may invite a new company's first administrator">
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      )}
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
