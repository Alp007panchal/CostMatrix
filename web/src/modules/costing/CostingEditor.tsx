import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { Async } from '../../ui/Async'
import { percent } from '../../lib/format'
import { listCategories, listComponentPrices, listProcessTypes } from '../library/api'
import {
  addAssemblyToPanel, addComponentToPanel, addManualItem, addPanel, approveCosting, createRevision,
  getCostingDetail, listBomItems, listCostings, listPanelSections, removeCostingAssembly, removeItem, removePanel,
  returnCosting, setAssemblySection, setCostingAssemblyQuantity, setItemQuantity, setLabourHours,
  submitCosting, updateCosting, updatePanel,
} from './api'
import { PanelCard } from './PanelCard'
import { TotalsPanel } from './TotalsPanel'
import { HistoryPanel } from './HistoryPanel'
import { QuotationLine } from '../quotation/QuotationLine'
import { BomExports } from './BomExports'
import { DocumentFiles } from '../documents/DocumentFiles'

/**
 * One costing. Editable while it is a current draft and the person may build
 * costings; read-only otherwise — and the database enforces the same rule, so
 * this is about showing the right controls, not about safety.
 */
export function CostingEditor() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { company, hasRole } = useSession()

  const detail = useQuery({ queryKey: ['costing', id], queryFn: () => getCostingDetail(id), enabled: Boolean(id) })
  const components = useQuery({ queryKey: ['components'], queryFn: listComponentPrices })
  const categories = useQuery({ queryKey: ['categories'], queryFn: listCategories })
  const processTypes = useQuery({ queryKey: ['process-types'], queryFn: listProcessTypes })
  const bom = useQuery({ queryKey: ['bom', id], queryFn: () => listBomItems(id), enabled: Boolean(id) })
  const sections = useQuery({ queryKey: ['panel-sections'], queryFn: listPanelSections })
  const costings = useQuery({ queryKey: ['costings'], queryFn: listCostings })

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['costing', id] })
    await queryClient.invalidateQueries({ queryKey: ['bom', id] })
    await queryClient.invalidateQueries({ queryKey: ['costing-history', id] })
    await queryClient.invalidateQueries({ queryKey: ['costings'] })
  }

  // Every edit is the same shape: do it, then reload the costing so the totals
  // come back from the database rather than being guessed at here.
  const act = useMutation({ mutationFn: (fn: () => Promise<unknown>) => fn(), onSuccess: refresh })
  const run = (fn: () => Promise<unknown>) => act.mutate(fn)

  const [returnComment, setReturnComment] = useState('')
  const [returning, setReturning] = useState(false)

  if (!company) return null

  return (
    <Async query={detail}>
      {({ costing, panels, assemblies, items, labour, assemblyTotals, panelPrices, totals, optionTotals, kits }) => {
        const canBuild = hasRole('costing_engineer') || hasRole('approver')
        const isApprover = hasRole('approver')
        const editable = costing.status === 'draft' && costing.is_current && canBuild
        const label = costing.currency_label
        const processNames = Object.fromEntries((processTypes.data ?? []).map((p) => [p.code, p.name]))

        return (
          <>
            <button onClick={() => navigate('/costings')}>← All costings</button>

            <div className="spread" style={{ marginTop: '.75rem', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div className="row">
                  <h1 style={{ margin: 0 }}>{costing.costing_no}</h1>
                  {costing.revision_no > 0 && <span className="badge">Rev {costing.revision_no}</span>}
                  <span className="badge">{statusLabel(costing.status)}</span>
                  {!costing.is_current && <span className="badge">superseded</span>}
                </div>
                {editable ? (
                  <input
                    defaultValue={costing.title}
                    style={{ marginTop: '.5rem', fontSize: '1.05rem' }}
                    onBlur={(e) => e.target.value.trim() && e.target.value !== costing.title && run(() => updateCosting(costing.id, { title: e.target.value.trim() }))}
                  />
                ) : (
                  <p style={{ fontSize: '1.05rem', margin: '.4rem 0' }}>{costing.title}</p>
                )}
                {costing.status === 'draft' && costing.return_comment && (
                  <p className="error" style={{ margin: '.4rem 0' }}>
                    Returned by the approver: “{costing.return_comment}”
                  </p>
                )}
              </div>

              <div className="row end">
                {editable && (
                  <button className="primary" onClick={() => run(() => submitCosting(costing.id))}>Submit for approval</button>
                )}
                {costing.status === 'submitted' && isApprover && costing.is_current && (
                  <>
                    <button onClick={() => setReturning(true)}>Return to draft</button>
                    <button className="primary" onClick={() => run(() => approveCosting(costing.id))}>Approve</button>
                  </>
                )}
                {costing.status === 'approved' && costing.is_current && canBuild && (
                  <button className="primary" onClick={() => act.mutate(async () => {
                    const rev = await createRevision(costing.id)
                    navigate(`/costings/${rev.id}`)
                  })}>
                    New revision
                  </button>
                )}
              </div>
            </div>

            {returning && (
              <div className="card">
                <h2 style={{ marginTop: 0 }}>Return to the engineer</h2>
                <textarea autoFocus placeholder="Say what needs changing" value={returnComment} onChange={(e) => setReturnComment(e.target.value)} />
                <div className="row end" style={{ marginTop: '.5rem' }}>
                  <button onClick={() => setReturning(false)}>Cancel</button>
                  <button className="primary" disabled={!returnComment.trim()} onClick={() => { run(() => returnCosting(costing.id, returnComment.trim())); setReturning(false); setReturnComment('') }}>
                    Return with this note
                  </button>
                </div>
              </div>
            )}

            {act.error && <p className="error">{String(act.error)}</p>}

            {costing.status === 'submitted' && (
              <p className="muted">Awaiting approval. Nothing can change until an approver approves it or returns it.</p>
            )}
            {costing.status === 'approved' && (
              <>
                <p className="muted">Approved and read-only. To change anything, create a new revision; this one stays as the record of what was agreed.</p>
                <QuotationLine costingId={costing.id} canRelease={isApprover && costing.is_current} />
              </>
            )}

            {/* One column, read top to bottom: what it costs, how it is built, what
                to export, what happened. */}
            <TotalsPanel costing={costing} totals={totals} optionTotals={optionTotals} bom={bom.data ?? []} categoryNames={Object.fromEntries((categories.data ?? []).map((c) => [c.code, c.name]))} />

            {panels.map((panel) => (
              <PanelCard
                key={panel.id}
                panel={panel}
                costing={costing}
                drafts={(costings.data ?? []).filter(
                  (c) => c.status === 'draft' && c.is_current && c.company_id === costing.company_id,
                )}
                price={panelPrices.find((p) => p.panel_id === panel.id)}
                assemblies={assemblies.filter((a) => a.panel_id === panel.id)}
                items={items}
                labour={labour}
                assemblyTotals={assemblyTotals}
                kits={kits}
                components={components.data ?? []}
                categories={categories.data ?? []}
                sections={(sections.data ?? []).map((s) => s.name)}
                label={label}
                editable={editable}
                processNames={processNames}
                handlers={{
                  onPanelChange: (pid, changes) => run(() => updatePanel(pid, changes)),
                  onPanelRemove: (pid) => run(() => removePanel(pid)),
                  onAddAssembly: async (pid, aid, qty, section) => { await addAssemblyToPanel(pid, aid, qty, section); await refresh() },
                  onAddComponent: async (pid, cid, qty, section) => { await addComponentToPanel(pid, cid, qty, section); await refresh() },
                  onAddManual: async (pid, input, section) => { await addManualItem(pid, input, section); await refresh() },
                  onAssemblyQuantity: (aid, q) => run(() => setCostingAssemblyQuantity(aid, q)),
                  onAssemblyRemove: (aid) => run(() => removeCostingAssembly(aid)),
                  onAssemblySection: (aid, section) => run(() => setAssemblySection(aid, section)),
                  onItemQuantity: (iid, q) => run(() => setItemQuantity(iid, q)),
                  onItemRemove: (iid) => run(() => removeItem(iid)),
                  onHours: (lid, h) => run(() => setLabourHours(lid, h)),
                  onPanelCopied: refresh,
                }}
              />
            ))}

            {editable && (
              <button onClick={() => run(() => addPanel(costing.id, company.id, `Panel ${panels.length + 1}`, panels.length))}>
                + Add a panel
              </button>
            )}
            {panels.length === 0 && !editable && <p className="empty">No panels.</p>}

            {editable && (
              <div className="card" style={{ marginTop: '1rem' }}>
                <label className="field" style={{ margin: 0 }}>
                  <span>Negotiation margin % <em className="hint">— optional buffer on top of everything, default 0</em></span>
                  <input
                    type="number" step="0.001" min="0" max="99.999"
                    defaultValue={costing.negotiation_margin_pct}
                    style={{ maxWidth: '8rem' }}
                    onBlur={(e) => Number(e.target.value) !== costing.negotiation_margin_pct && run(() => updateCosting(costing.id, { negotiation_margin_pct: Number(e.target.value) }))}
                  />
                </label>
                <p className="muted" style={{ fontSize: '.8125rem', margin: '.4rem 0 0' }}>
                  Material margin {percent(costing.material_margin_pct)} and labour margin {percent(costing.labour_margin_pct)} were frozen from the company settings when this costing was created.
                </p>
              </div>
            )}

            {/* The spec, the tender schedule, the drawing this costing answers.
                Kept with it, and read so the assistant can use them later. */}
            <DocumentFiles entityType="costing" entityId={costing.id} companyId={costing.company_id} canEdit={editable} />

            <BomExports costingId={costing.id} costingNo={costing.costing_no} revisionNo={costing.revision_no} currencyLabel={label} />
            <HistoryPanel costingId={costing.id} />
          </>
        )
      }}
    </Async>
  )
}

function statusLabel(status: string): string {
  return status === 'draft' ? 'Draft' : status === 'submitted' ? 'Awaiting approval' : 'Approved'
}
