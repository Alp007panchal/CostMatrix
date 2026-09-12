import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { Async } from '../../ui/Async'
import { percent } from '../../lib/format'
import { listCategories, listComponentPrices, listProcessTypes } from '../library/api'
import {
  addAssemblyToPanel, addComponentToPanel, addManualItem, addPanel, approveCosting, copyPanel,
  createRevision, getCostingDetail, listBomItems, listCostings, listPanelSections, listPanelWarnings,
  panelFit, reissueCosting, removeCostingAssembly, removeItem, removePanel, returnCosting,
  setAssemblySection, setCostingAssemblyQuantity, setItemQuantity, setLabourHours, submitCosting,
  updateCosting, updatePanel,
} from './api'
import { PanelCard } from './PanelCard'
import { CostingGrid } from './CostingGrid'
import { costingWarningSummary, warningsByPanel } from './warnings'
import { readCostingView, writeCostingView, type CostingView } from './costing-view'
import { TotalsPanel } from './TotalsPanel'
import { HistoryPanel } from './HistoryPanel'
import { QuotationLine } from '../quotation/QuotationLine'
import { BomExports } from './BomExports'
import { DocumentFiles } from '../documents/DocumentFiles'
import { BomImportCard } from './BomImportCard'
import { ApprovalPanel } from './ApprovalPanel'
import { ActualHoursCard } from './ActualHoursCard'
import { AssistantPanel } from '../assistant/AssistantPanel'

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
  // Roadmap 3.4: what the compatibility rules make of each panel. Advisory,
  // so a failure to load it must never stop the costing being shown.
  const warnings = useQuery({
    queryKey: ['panel-warnings', id],
    queryFn: () => listPanelWarnings(id),
    enabled: Boolean(id),
  })

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['costing', id] })
    await queryClient.invalidateQueries({ queryKey: ['bom', id] })
    await queryClient.invalidateQueries({ queryKey: ['costing-history', id] })
    await queryClient.invalidateQueries({ queryKey: ['costings'] })
    await queryClient.invalidateQueries({ queryKey: ['panel-warnings', id] })
  }

  // Every edit is the same shape: do it, then reload the costing so the totals
  // come back from the database rather than being guessed at here.
  const act = useMutation({ mutationFn: (fn: () => Promise<unknown>) => fn(), onSuccess: refresh })
  const run = (fn: () => Promise<unknown>) => act.mutate(fn)

  const [returnComment, setReturnComment] = useState('')
  const [returning, setReturning] = useState(false)
  // Panel by panel, or the whole costing as one grid (roadmap 2.9). Remembered
  // per person in their own browser — it is a preference, not company data.
  const [view, setView] = useState<CostingView>(readCostingView)
  const chooseView = (next: CostingView) => { setView(next); writeCostingView(next) }

  // The space check for every panel, for the grid's column headings. Only asked
  // for when the grid is open, and silent when nothing has been measured (F12).
  const panelIds = (detail.data?.panels ?? []).map((p) => p.id)
  const fits = useQuery({
    queryKey: ['panel-fits', id, panelIds.join(',')],
    queryFn: async () => {
      const pairs = await Promise.all(panelIds.map(async (pid) => [pid, await panelFit(pid)] as const))
      return Object.fromEntries(pairs)
    },
    enabled: view === 'grid' && panelIds.length > 0,
  })

  if (!company) return null

  return (
    <Async query={detail}>
      {({ costing, panels, assemblies, items, labour, assemblyTotals, panelPrices, totals, optionTotals, kits }) => {
        const canBuild = hasRole('costing_engineer') || hasRole('approver')
        const isApprover = hasRole('approver')
        const editable = costing.status === 'draft' && costing.is_current && canBuild
        const label = costing.currency_label
        const processNames = Object.fromEntries((processTypes.data ?? []).map((p) => [p.code, p.name]))
        const panelWarnings = warningsByPanel(warnings.data ?? [])

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
                  <>
                    {/* Roadmap 2.6: the same job at today's prices, for a quotation
                        that has run out. A revision, so the approved one stands. */}
                    <button
                      title="A new revision with every line priced at today's prices"
                      onClick={() => act.mutate(async () => {
                        const out = await reissueCosting(costing.id)
                        navigate(`/costings/${out.costing_id}`)
                      })}
                    >
                      Re-issue at today's prices
                    </button>
                    <button className="primary" onClick={() => act.mutate(async () => {
                      const rev = await createRevision(costing.id)
                      navigate(`/costings/${rev.id}`)
                    })}>
                      New revision
                    </button>
                  </>
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

            {/* Two ways of reading the same costing: panel by panel, or the whole
                thing as a grid (roadmap 2.9). The grid edits through the same
                functions, so neither view is the privileged one. */}
            <div className="row" style={{ marginTop: '.75rem', gap: '.4rem' }}>
              <button
                className={view === 'panels' ? 'primary' : undefined}
                aria-pressed={view === 'panels'}
                onClick={() => chooseView('panels')}
              >
                Panel by panel
              </button>
              <button
                className={view === 'grid' ? 'primary' : undefined}
                aria-pressed={view === 'grid'}
                onClick={() => chooseView('grid')}
              >
                Grid
              </button>
            </div>

            {/* One column, read top to bottom: what it costs, how it is built, what
                to export, what happened. */}
            {/* Roadmap 2.5: what the company's rules make of this costing. */}
            <ApprovalPanel costingId={costing.id} status={costing.status} />

            <TotalsPanel
              costing={costing}
              totals={totals}
              optionTotals={optionTotals}
              bom={bom.data ?? []}
              categoryNames={Object.fromEntries((categories.data ?? []).map((c) => [c.code, c.name]))}
              editable={editable}
              onChooseOption={(chosen) => run(() => updateCosting(costing.id, { chosen_option_label: chosen }))}
            />

            {/* Roadmap 3.4: one line so nobody has to scroll every panel to find
                out whether the checks found anything. */}
            {costingWarningSummary(warnings.data ?? []) && (
              <p className="muted" style={{ margin: '.4rem 0 0' }}>
                Compatibility checks: {costingWarningSummary(warnings.data ?? [])}. They are shown on the panels
                themselves, and change no figure.
              </p>
            )}

            {view === 'grid' && (
              <CostingGrid
                costing={costing}
                panels={panels}
                assemblies={assemblies}
                items={items}
                panelPrices={panelPrices}
                totals={totals}
                kits={kits}
                components={components.data ?? []}
                categoryNames={Object.fromEntries((categories.data ?? []).map((c) => [c.code, c.name]))}
                fits={fits.data ?? {}}
                editable={editable}
                handlers={{
                  onAddKit: async (pid, kid, qty) => { await addAssemblyToPanel(pid, kid, qty, null); await refresh() },
                  onAddComponent: async (pid, cid, qty) => { await addComponentToPanel(pid, cid, qty, null); await refresh() },
                  onKitQuantity: (lid, qty) => run(() => setCostingAssemblyQuantity(lid, qty)),
                  onItemQuantity: (iid, qty) => run(() => setItemQuantity(iid, qty)),
                  onRemoveKit: (lid) => run(() => removeCostingAssembly(lid)),
                  onRemoveItem: (iid) => run(() => removeItem(iid)),
                  onAddPanel: () => run(() => addPanel(costing.id, company.id, `Panel ${panels.length + 1}`, panels.length)),
                  onCopyPanel: (pid) => run(() => copyPanel(
                    pid, costing.id, `${panels.find((p) => p.id === pid)?.name ?? 'Panel'} (copy)`,
                  )),
                }}
              />
            )}

            {view === 'panels' && panels.map((panel) => (
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
                warnings={panelWarnings.get(panel.id) ?? []}
                label={label}
                editable={editable}
                processNames={processNames}
                handlers={{
                  onPanelChange: (pid, changes) => run(() => updatePanel(pid, changes)),
                  onPanelRemove: (pid) => run(() => removePanel(pid)),
                  onAddAssembly: async (pid, aid, qty, section, params) => { await addAssemblyToPanel(pid, aid, qty, section, params); await refresh() },
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

            {view === 'panels' && editable && (
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

            {/* Somebody else's parts list, matched to kits and parts (roadmap 2.3). */}
            <BomImportCard costingId={costing.id} editable={editable} />

            {/* What the boards actually took (roadmap 2.8). Available whatever the
                costing's status, because the work happens after approval, and it
                changes nothing this costing was priced on. */}
            <ActualHoursCard
              costingId={costing.id}
              panels={panels}
              processTypes={processTypes.data ?? []}
              currencyLabel={label}
              canRecord={canBuild}
            />

            {/* The spec, the tender schedule, the drawing this costing answers.
                Kept with it, and read so the assistant can use them later. */}
            <DocumentFiles entityType="costing" entityId={costing.id} companyId={costing.company_id} canEdit={editable} />

            {/* Reads this costing and those documents, and proposes; a person
                applies. Nothing it does reaches the costing on its own. */}
            <AssistantPanel
              entityType="costing"
              entityId={costing.id}
              panels={panels}
              canApply={editable}
              onApplied={() => void refresh()}
            />

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
