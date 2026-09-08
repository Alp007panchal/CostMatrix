import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { Async, Field } from '../../ui/Async'
import type { Assembly } from '../../lib/database.types'
import { createAssembly, listAssemblies, setAssemblyActive } from './api'
import { AssemblyEditor } from './AssemblyEditor'

/**
 * The standard building blocks of a panel — enclosure, incomer section,
 * busbar set, wiring — each with its own material and its own hours. Called
 * "kits" in conversation. A costing is built by adding these.
 */
export function AssembliesPage() {
  const { company, isMasterAdmin, hasRole } = useSession()
  const queryClient = useQueryClient()
  const assemblies = useQuery({ queryKey: ['assemblies'], queryFn: listAssemblies })

  const [open, setOpen] = useState<Assembly | null>(null)
  const [adding, setAdding] = useState(false)
  const [showInactive, setShowInactive] = useState(false)

  const isCompanyAdmin = hasRole('company_admin')
  const canAdd = isMasterAdmin || isCompanyAdmin
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['assemblies'] })

  const toggleActive = useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) =>
      setAssemblyActive(input.id, input.isActive),
    onSuccess: refresh,
  })

  if (!company) return null

  if (open) {
    return (
      <AssemblyEditor
        assembly={open}
        onBack={() => {
          setOpen(null)
          void refresh()
        }}
      />
    )
  }

  const rows = (assemblies.data ?? []).filter((a) => showInactive || a.is_active)

  return (
    <>
      <div className="spread">
        <h1>Assemblies</h1>
        {canAdd && (
          <button className="primary" onClick={() => setAdding(true)}>
            Add assembly
          </button>
        )}
      </div>
      <p className="muted">
        A panel is costed as a sum of these. Each carries its own material and its own hours per
        kind of work, so labour is never a percentage of the parts.
      </p>

      {adding && (
        <NewAssemblyForm
          companyId={company.id}
          canAddMaster={isMasterAdmin}
          onClose={() => setAdding(false)}
          onCreated={(a) => {
            setAdding(false)
            void refresh()
            setOpen(a)
          }}
        />
      )}

      {toggleActive.error && <p className="error">{String(toggleActive.error)}</p>}

      <div className="card">
        <div className="row end" style={{ marginBottom: '.5rem' }}>
          <label className="row" style={{ gap: '.35rem' }}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Show retired
          </label>
        </div>
        <div className="table-wrap">
          <Async query={assemblies} empty="No assemblies yet. Add the first one.">
            {() => (
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Owner</th>
                    <th className="right"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => {
                    const mine = a.company_id === company.id
                    const editable = a.company_id === null ? isMasterAdmin : mine && isCompanyAdmin
                    return (
                      <tr key={a.id} className={a.is_active ? undefined : 'inactive'}>
                        <td>{a.code}</td>
                        <td>
                          {a.name}
                          {a.description && <div className="muted">{a.description}</div>}
                        </td>
                        <td className="muted">{a.company_id === null ? 'Master' : 'Yours'}</td>
                        <td className="right">
                          <button onClick={() => setOpen(a)}>
                            {editable || isCompanyAdmin ? 'Open' : 'View'}
                          </button>{' '}
                          {editable && (
                            <button
                              onClick={() =>
                                toggleActive.mutate({ id: a.id, isActive: !a.is_active })
                              }
                            >
                              {a.is_active ? 'Retire' : 'Restore'}
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </Async>
        </div>
      </div>
    </>
  )
}

function NewAssemblyForm({
  companyId,
  canAddMaster,
  onClose,
  onCreated,
}: {
  companyId: string
  canAddMaster: boolean
  onClose: () => void
  onCreated: (a: Assembly) => void
}) {
  const [toMaster, setToMaster] = useState(canAddMaster)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const create = useMutation({
    mutationFn: () =>
      createAssembly({
        company_id: toMaster ? null : companyId,
        code: code.trim(),
        name: name.trim(),
        description: description.trim() || null,
      }),
    onSuccess: onCreated,
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    create.mutate()
  }

  return (
    <form className="card" onSubmit={submit}>
      <div className="spread">
        <h2 style={{ marginTop: 0 }}>New assembly</h2>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
      {canAddMaster && (
        <label className="row" style={{ gap: '.4rem', marginBottom: '.9rem' }}>
          <input type="checkbox" checked={toMaster} onChange={(e) => setToMaster(e.target.checked)} />
          Add to the master library, shared with every company
        </label>
      )}
      <Field label="Code" hint="short and unique, e.g. INC-1600">
        <input value={code} required onChange={(e) => setCode(e.target.value)} />
      </Field>
      <Field label="Name">
        <input value={name} required onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Description" hint="optional">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      {create.error && <p className="error">{String(create.error)}</p>}
      <div className="row end">
        <button type="submit" className="primary" disabled={create.isPending}>
          {create.isPending ? 'Creating…' : 'Create and open'}
        </button>
      </div>
    </form>
  )
}
