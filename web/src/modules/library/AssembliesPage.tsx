import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { Async, Field } from '../../ui/Async'
import { PageHeader } from '../../app/PageHeader'
import type { Assembly } from '../../lib/database.types'
import { createAssembly, listAssemblies, setAssemblyActive } from './api'
import { listKitGroups } from './kits-api'
import { AssemblyEditor } from './AssemblyEditor'

/**
 * Kits: the standard building blocks of a panel — a main device with its
 * busbar, cable and accessories — grouped into kit groups that carry the
 * labour hours. A costing is built by adding these. (The table is still
 * called assemblies; only the words on screen changed.)
 */
export function AssembliesPage() {
  const { company, isMasterAdmin, hasRole } = useSession()
  const queryClient = useQueryClient()
  const assemblies = useQuery({ queryKey: ['assemblies'], queryFn: listAssemblies })
  const groups = useQuery({ queryKey: ['kit-groups'], queryFn: listKitGroups })
  const groupName = (id: string | null) => groups.data?.find((g) => g.id === id)?.name ?? '—'

  const [open, setOpen] = useState<Assembly | null>(null)
  const [adding, setAdding] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [search, setSearch] = useState('')
  const [group, setGroup] = useState('')

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

  const needle = search.trim().toLowerCase()
  const rows = (assemblies.data ?? []).filter((a) => {
    if (!showInactive && !a.is_active) return false
    if (group !== '' && a.kit_group_id !== group) return false
    if (needle === '') return true
    return [a.code, a.name, a.description].some((f) => String(f ?? '').toLowerCase().includes(needle))
  })

  return (
    <>
      <PageHeader title="Kits" meta={`${rows.length} of ${(assemblies.data ?? []).length} kits`}>
        {canAdd && (
          <button className="btn" onClick={() => setAdding(true)}>
            Add kit
          </button>
        )}
      </PageHeader>
      <p className="intro">
        A panel is costed as a sum of these. Each kit is a main device plus its busbar, cable and
        accessories; its <Link to="/library/kit-groups">kit group</Link> carries the hours per kind
        of work, which a kit may override. Labour is never a percentage of the parts.
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

      <div className="filters">
        <input
          placeholder="Search code, name or description"
          value={search}
          style={{ flex: 2, minWidth: '14rem' }}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={group} style={{ flex: 1, minWidth: '10rem' }} onChange={(e) => setGroup(e.target.value)}>
          <option value="">All kit groups</option>
          {(groups.data ?? []).map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <label className="row" style={{ gap: '.35rem' }}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show retired
        </label>
        <span className="chip">{rows.length} shown</span>
      </div>

      <div className="panel flush">
        <div className="table-wrap">
          <Async query={assemblies} empty="No kits yet. Add the first one.">
            {() => (
              <table>
                <thead>
                  <tr>
                    <th>Kit</th>
                    <th>Name</th>
                    <th>Group</th>
                    <th className="right">Rating</th>
                    <th className="right">Module height</th>
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
                        <td className="mono">{a.code}</td>
                        <td>
                          {a.name}
                          {(a.description !== null || a.tags.length > 0) && (
                            <span className="sub">
                              {[a.description, ...a.tags].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </td>
                        <td className="muted">{groupName(a.kit_group_id)}</td>
                        <td className="right muted">
                          {a.rating != null ? `${a.rating} ${a.rating_unit ?? ''}${a.poles ? `, ${a.poles}P` : ''}` : ''}
                        </td>
                        <td className="right muted">
                          {a.module_height_mm == null ? '—' : `${a.module_height_mm} mm`}
                        </td>
                        <td className="muted">{a.company_id === null ? 'Master' : 'Yours'}</td>
                        <td className="right">
                          <button className="ghost small" onClick={() => setOpen(a)}>
                            {editable || isCompanyAdmin ? 'Open' : 'View'}
                          </button>{' '}
                          {editable && (
                            <button
                              className="ghost small"
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
        <h2 style={{ marginTop: 0 }}>New kit</h2>
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
      <Field label="Code" hint="short and unique, e.g. MCCB-250-KIT">
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
