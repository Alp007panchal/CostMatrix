import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { Async } from '../../ui/Async'
import { money } from '../../lib/format'
import type { Assembly } from '../../lib/database.types'
import { AssemblyHoursRow } from './AssemblyHoursRow'
import { ComponentPicker } from './ComponentPicker'
import { KitDetailsForm } from './KitDetailsForm'
import { setMainDevice } from './kits-api'
import { addAssemblyComponent, clearCompanyAssemblyHours, listAssemblyComponents, listAssemblyHours, listComponentPrices, removeAssemblyComponent, setAssemblyComponentQuantity, setAssemblyHours, setCompanyAssemblyHours } from './api'
import { listLabourRates } from './rates-api'

/**
 * One kit: its group and rating, what goes in it (one line is the main
 * device) and how long it takes.
 *
 * Who may change what:
 *   master kit   — master admin edits details, material and hours; a company
 *                  admin may only set their own hours beside the master figure
 *   private kit  — that company's admin edits everything
 */
export function AssemblyEditor({ assembly, onBack }: { assembly: Assembly; onBack: () => void }) {
  const { company, isMasterAdmin, hasRole } = useSession()
  const queryClient = useQueryClient()

  const isMaster = assembly.company_id === null
  const isCompanyAdmin = hasRole('company_admin')
  const canEditContents = isMaster ? isMasterAdmin : isCompanyAdmin
  const canOverrideHours = isMaster && isCompanyAdmin && !isMasterAdmin

  const lines = useQuery({
    queryKey: ['assembly-components', assembly.id],
    queryFn: () => listAssemblyComponents(assembly.id),
  })
  const hours = useQuery({
    queryKey: ['assembly-hours', assembly.id],
    queryFn: () => listAssemblyHours(assembly.id),
  })
  const prices = useQuery({ queryKey: ['components'], queryFn: listComponentPrices })
  const rates = useQuery({ queryKey: ['labour-rates'], queryFn: listLabourRates })

  const refreshLines = () =>
    queryClient.invalidateQueries({ queryKey: ['assembly-components', assembly.id] })
  const refreshHours = () =>
    queryClient.invalidateQueries({ queryKey: ['assembly-hours', assembly.id] })

  const priceById = useMemo(
    () => new Map((prices.data ?? []).map((p) => [p.id, p])),
    [prices.data],
  )

  const rateFor = (processType: string): number => {
    const all = rates.data ?? []
    const own = all.find((r) => r.company_id === company?.id && r.process_type === processType)
    if (own) return own.hourly_rate
    const master = all.find((r) => r.company_id === null && r.process_type === processType)
    return master ? master.hourly_rate / (company?.exchange_rate ?? 1) : 0
  }

  const materialTotal = (lines.data ?? []).reduce(
    (sum, l) => sum + l.quantity * (priceById.get(l.component_id)?.unit_price ?? 0),
    0,
  )
  const labourTotal = (hours.data ?? []).reduce(
    (sum, h) => sum + h.effective_hours * rateFor(h.process_type),
    0,
  )

  const changeQty = useMutation({
    mutationFn: (input: { id: string; quantity: number }) =>
      setAssemblyComponentQuantity(input.id, input.quantity),
    onSuccess: refreshLines,
  })
  const remove = useMutation({ mutationFn: removeAssemblyComponent, onSuccess: refreshLines })
  const markMain = useMutation({
    mutationFn: (lineId: string) => setMainDevice(assembly.id, lineId),
    onSuccess: refreshLines,
  })
  const hasMainDevice = (lines.data ?? []).some((l) => l.is_main_device)

  const label = company?.currency_label ?? 'KES'

  return (
    <>
      <div className="spread">
        <div>
          <button onClick={onBack}>← All kits</button>
          <h1 style={{ marginTop: '.75rem' }}>
            {assembly.code} — {assembly.name}
          </h1>
          <p className="muted">
            {isMaster ? 'Master kit, shared with every company.' : 'Your own kit.'}
            {assembly.description && ` ${assembly.description}`}
          </p>
          {company && (
            <KitDetailsForm
              assembly={assembly}
              isMaster={isMaster}
              companyId={company.id}
              editable={canEditContents}
              onSaved={() => {
                void queryClient.invalidateQueries({ queryKey: ['assemblies'] })
                void refreshHours()
              }}
            />
          )}
        </div>
        <div className="card" style={{ minWidth: '14rem', margin: 0 }}>
          <div className="spread">
            <span className="muted">Material</span>
            <strong>{money(materialTotal, label)}</strong>
          </div>
          <div className="spread">
            <span className="muted">Labour</span>
            <strong>{money(labourTotal, label)}</strong>
          </div>
          <div className="spread" style={{ borderTop: '1px solid var(--line)', paddingTop: '.4rem' }}>
            <span>One of these</span>
            <strong>{money(materialTotal + labourTotal, label)}</strong>
          </div>
          <p className="muted" style={{ fontSize: '.75rem', margin: '.4rem 0 0' }}>
            Indicative, at today&rsquo;s prices and your current rates.
          </p>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Material</h2>
        {!hasMainDevice && (lines.data ?? []).length > 0 && (
          <p className="muted">No main device chosen yet — tick the breaker or switch this kit is built around.</p>
        )}
        <div className="table-wrap">
          <Async query={lines} empty="Nothing in it yet.">
            {(rows) => (
              <table>
                <thead>
                  <tr>
                    <th title="Main device">Main</th>
                    <th>Component</th>
                    <th>Make</th>
                    <th className="right">Qty</th>
                    <th className="right">Each</th>
                    <th className="right">Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => {
                    const p = priceById.get(l.component_id)
                    return (
                      <tr key={l.id}>
                        <td>
                          <input
                            type="radio"
                            name="main-device"
                            checked={l.is_main_device}
                            disabled={!canEditContents}
                            title="Main device"
                            onChange={() => markMain.mutate(l.id)}
                          />
                        </td>
                        <td>
                          {p ? `${p.code} — ${p.name}` : 'Unknown component'}
                          {p?.part_number && <div className="muted">{p.part_number}</div>}
                        </td>
                        <td>{p?.manufacturer}</td>
                        <td className="right">
                          {canEditContents ? (
                            <input
                              type="number"
                              step="0.001"
                              min="0.001"
                              defaultValue={l.quantity}
                              style={{ width: '5.5rem', textAlign: 'right' }}
                              onBlur={(e) => {
                                const q = Number(e.target.value)
                                if (q > 0 && q !== l.quantity) changeQty.mutate({ id: l.id, quantity: q })
                              }}
                            />
                          ) : (
                            l.quantity
                          )}
                        </td>
                        <td className="right">{p ? money(p.unit_price, label) : '—'}</td>
                        <td className="right">
                          {p ? money(l.quantity * p.unit_price, label) : '—'}
                        </td>
                        <td className="right">
                          {canEditContents && (
                            <button className="danger" onClick={() => remove.mutate(l.id)}>
                              Remove
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
        {(changeQty.error || remove.error || markMain.error) && (
          <p className="error">{String(changeQty.error ?? remove.error ?? markMain.error)}</p>
        )}
        {canEditContents && (
          <ComponentPicker
            candidates={(prices.data ?? []).filter(
              (p) =>
                p.is_active &&
                // A master kit may only hold master components.
                (!isMaster || p.company_id === null) &&
                !(lines.data ?? []).some((l) => l.component_id === p.id),
            )}
            label={label}
            onPick={(componentId, qty) =>
              addAssemblyComponent(assembly.id, componentId, qty, (lines.data ?? []).length).then(
                refreshLines,
              )
            }
          />
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Labour, in hours</h2>
        <p className="muted">
          {canOverrideHours
            ? 'These are the master figures (the kit\'s own, or its group\'s). Enter your own to use them instead; the master stays visible beside yours.'
            : 'Hours per kind of work. Blank means the kit group\'s hours apply; a figure here overrides the group for that kind of work. Labour cost is hours times the hourly rate.'}
        </p>
        <div className="table-wrap">
          <Async query={hours}>
            {(rows) => (
              <table>
                <thead>
                  <tr>
                    <th>Kind of work</th>
                    <th className="right">{canOverrideHours ? 'Master' : 'Hours'}</th>
                    {canOverrideHours && <th className="right">Yours</th>}
                    <th className="right">Rate</th>
                    <th className="right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((h) => (
                    <AssemblyHoursRow
                      key={h.process_type}
                      row={h}
                      rate={rateFor(h.process_type)}
                      label={label}
                      mode={canOverrideHours ? 'override' : canEditContents ? 'edit' : 'view'}
                      onSave={async (value) => {
                        if (canOverrideHours && company) {
                          await setCompanyAssemblyHours(company.id, assembly.id, h.process_type, value)
                        } else {
                          await setAssemblyHours(assembly.id, h.process_type, value)
                        }
                        await refreshHours()
                      }}
                      onClearOverride={
                        canOverrideHours && company
                          ? async () => {
                              await clearCompanyAssemblyHours(company.id, assembly.id, h.process_type)
                              await refreshHours()
                            }
                          : undefined
                      }
                    />
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
