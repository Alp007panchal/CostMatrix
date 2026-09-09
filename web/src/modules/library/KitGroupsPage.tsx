import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { Async, Field } from '../../ui/Async'
import type { KitGroup, ProcessType } from '../../lib/database.types'
import { listProcessTypes } from './api'
import { createKitGroup, listAllKitGroupHours, listKitGroups, setKitGroupHours } from './kits-api'

/**
 * Kit groups and their labour hours. A group's hours apply to every kit in it
 * unless the kit sets its own for that kind of work. Master groups are the
 * master admin's; a company admin may add and edit the company's own.
 */
export function KitGroupsPage() {
  const { company, isMasterAdmin, hasRole } = useSession()
  const queryClient = useQueryClient()
  const groups = useQuery({ queryKey: ['kit-groups'], queryFn: listKitGroups })
  const hours = useQuery({ queryKey: ['kit-group-hours'], queryFn: listAllKitGroupHours })
  const processTypes = useQuery({ queryKey: ['process-types'], queryFn: listProcessTypes })
  const [adding, setAdding] = useState(false)

  const isCompanyAdmin = hasRole('company_admin')
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['kit-groups'] })
    void queryClient.invalidateQueries({ queryKey: ['kit-group-hours'] })
    void queryClient.invalidateQueries({ queryKey: ['assembly-hours'] })
  }

  if (!company) return null

  const canEdit = (g: KitGroup) => (g.company_id === null ? isMasterAdmin : g.company_id === company.id && isCompanyAdmin)
  const hoursFor = (groupId: string, processType: string) =>
    hours.data?.find((h) => h.kit_group_id === groupId && h.process_type === processType)?.hours

  return (
    <>
      <div className="spread">
        <div>
          <Link to="/library/assemblies">← Kits</Link>
          <h1 style={{ marginTop: '.5rem' }}>Kit groups</h1>
        </div>
        {(isMasterAdmin || isCompanyAdmin) && (
          <button className="primary" onClick={() => setAdding(true)}>
            Add kit group
          </button>
        )}
      </div>
      <p className="muted">
        Hours per kind of work for every kit in the group. A kit that needs different hours for one
        kind of work sets its own on the kit; the group still covers the rest. Blank means zero.
      </p>

      {adding && (
        <NewGroupForm
          companyId={company.id}
          canAddMaster={isMasterAdmin}
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false)
            refresh()
          }}
        />
      )}

      <div className="card">
        <div className="table-wrap">
          <Async query={groups} empty="No kit groups yet. Add the first one.">
            {(rows) => (
              <table>
                <thead>
                  <tr>
                    <th>Group</th>
                    {(processTypes.data ?? []).map((p) => (
                      <th key={p.code} className="right">
                        {p.name}
                      </th>
                    ))}
                    <th>Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((g) => (
                    <tr key={g.id}>
                      <td>
                        {g.name}
                        {g.description && <div className="muted">{g.description}</div>}
                      </td>
                      {(processTypes.data ?? []).map((p) => (
                        <HoursCell
                          key={p.code}
                          groupId={g.id}
                          processType={p}
                          hours={hoursFor(g.id, p.code)}
                          editable={canEdit(g)}
                          onSaved={refresh}
                        />
                      ))}
                      <td className="muted">{g.company_id === null ? 'Master' : 'Yours'}</td>
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

function HoursCell({
  groupId,
  processType,
  hours,
  editable,
  onSaved,
}: {
  groupId: string
  processType: ProcessType
  hours: number | undefined
  editable: boolean
  onSaved: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  if (!editable) return <td className="right">{hours == null ? '—' : hours.toFixed(2)}</td>
  return (
    <td className="right">
      <input
        type="number"
        step="0.25"
        min="0"
        defaultValue={hours ?? ''}
        placeholder="0"
        style={{ width: '6rem', textAlign: 'right' }}
        onBlur={(e) => {
          const n = Number(e.target.value)
          if (e.target.value === '' || !Number.isFinite(n) || n < 0 || n === hours) return
          setKitGroupHours(groupId, processType.code, n).then(onSaved).catch((err: unknown) => setError(String(err)))
        }}
      />
      {error && <div className="error">{error}</div>}
    </td>
  )
}

function NewGroupForm({
  companyId,
  canAddMaster,
  onClose,
  onCreated,
}: {
  companyId: string
  canAddMaster: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const [toMaster, setToMaster] = useState(canAddMaster)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const create = useMutation({
    mutationFn: () =>
      createKitGroup({
        company_id: toMaster ? null : companyId,
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
        <h2 style={{ marginTop: 0 }}>New kit group</h2>
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
      <Field label="Name" hint="e.g. MCCB, ATS, APFC BANK">
        <input value={name} required onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Description" hint="optional">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      {create.error && <p className="error">{String(create.error)}</p>}
      <div className="row end">
        <button type="submit" className="primary" disabled={create.isPending}>
          {create.isPending ? 'Creating…' : 'Create'}
        </button>
      </div>
    </form>
  )
}
