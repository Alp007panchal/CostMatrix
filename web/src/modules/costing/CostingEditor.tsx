import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { Async } from '../../ui/Async'
import { money } from '../../lib/format'
import { listCategories, listComponentPrices, listProcessTypes } from '../library/api'
import {
  addAssemblyToPanel, addComponentToPanel, addManualItem, addPanel, approveCosting,
  createRevision, getCostingDetail, listBomItems, listCostings, listPanelSections, listPanelWarnings,
  panelFit, reissueCosting, removeCostingAssembly, removeItem, removePanel, returnCosting,
  setAssemblySection, setCostingAssemblyQuantity, setItemQuantity, setLabourHours, submitCosting,
  updateCosting, updatePanel,
} from './api'
import { PanelCard } from './PanelCard'
import { PanelWarnings } from './PanelWarnings'
import { warningsByPanel } from './warnings'
import { useFeatures } from '../admin/use-features'
import { readCostingView, writeCostingView } from './costing-view'
import { TotalsPanel } from './TotalsPanel'
import { LabourWarning } from './LabourWarning'
import { CostingHeader } from './CostingHeader'
import { CostingWhole } from './CostingWhole'
import { costingTabs, firstTabKey } from './costing-tabs'

/**
 * One costing. Editable while it is a current draft and the person may build
 * costings; read-only otherwise — and the database enforces the same rule, so
 * this is about showing the right controls, not about safety.
 *
 * Laid out as vertical tabs (house style §5): the panels are the work, so they
 * are the tabs, and the totals sit under them where they are always in view.
 * Everything that belongs to the whole costing — the grid, the documents, the
 * exports, the history — is filed behind a name in `CostingWhole` rather than
 * making a four-panel costing a page five screens long.
 */
export function CostingEditor() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { company, hasRole } = useSession()
  // Which advanced features this company has switched on (the road to
  // production). One query for every card below, not one each.
  const { on } = useFeatures()

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
    enabled: Boolean(id) && on('compatibility_checks'),
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

  // Null until somebody chooses: the first render works out which tab to open
  // from the panels it has, which it cannot do before they have loaded.
  const [tab, setTab] = useState<string | null>(null)

  // The space check for every panel, for the grid's column headings. Only asked
  // for when the grid is open, and silent when nothing has been measured (F12).
  const panelIds = (detail.data?.panels ?? []).map((p) => p.id)
  const fits = useQuery({
    queryKey: ['panel-fits', id, panelIds.join(',')],
    queryFn: async () => {
      const pairs = await Promise.all(panelIds.map(async (pid) => [pid, await panelFit(pid)] as const))
      return Object.fromEntries(pairs)
    },
    enabled: tab === 'grid' && panelIds.length > 0,
  })

  if (!company) return null

  return (
    <Async query={detail}>
      {(data) => {
        const { costing, panels, assemblies, items, labour, assemblyTotals, panelPrices, totals, optionTotals, kits } = data
        const canBuild = hasRole('costing_engineer') || hasRole('approver')
        const isApprover = hasRole('approver')
        const editable = costing.status === 'draft' && costing.is_current && canBuild
        const label = costing.currency_label
        const processNames = Object.fromEntries((processTypes.data ?? []).map((p) => [p.code, p.name]))
        const panelWarnings = warningsByPanel(warnings.data ?? [])
        const categoryNames = Object.fromEntries((categories.data ?? []).map((c) => [c.code, c.name]))

        const tabs = costingTabs({ panels, panelPrices, on, money: (n) => money(n, label) })
        const current = tab ?? firstTabKey(tabs, readCostingView() === 'grid')
        const choose = (key: string) => {
          setTab(key)
          // Remembered per person in their own browser: it is a preference, not
          // company data, and only the grid is worth remembering.
          writeCostingView(key === 'grid' ? 'grid' : 'panels')
        }
        const panel = panels.find((p) => p.id === current)

        return (
          <>
            <CostingHeader
              costing={costing}
              panelCount={panels.length}
              editable={editable}
              isApprover={isApprover}
              canBuild={canBuild}
              onSubmit={() => run(() => submitCosting(costing.id))}
              onApprove={() => run(() => approveCosting(costing.id))}
              onReturn={(comment) => run(() => returnCosting(costing.id, comment))}
              onRevision={() => act.mutate(async () => {
                const rev = await createRevision(costing.id)
                navigate(`/costings/${rev.id}`)
              })}
              onReissue={() => act.mutate(async () => {
                const out = await reissueCosting(costing.id)
                navigate(`/costings/${out.costing_id}`)
              })}
            />

            {act.error && <p className="error">{String(act.error)}</p>}
            {costing.status === 'submitted' && (
              <p className="intro">Awaiting approval. Nothing can change until an approver approves it or returns it.</p>
            )}
            {costing.status === 'approved' && (
              <p className="intro">
                Approved and read-only. To change anything, create a new revision; this one stays as
                the record of what was agreed.
              </p>
            )}

            <div className="vlayout">
              <div>
                <div className="vtabs">
                  <div className="vlabel">Panels in this costing</div>
                  {tabs.filter((t) => t.group === 'panels').map((t) => (
                    <button key={t.key} className={t.key === current ? 'vtab active' : 'vtab'} onClick={() => choose(t.key)}>
                      {t.label}
                      {t.note !== undefined && <span className="cnt">{t.note}</span>}
                    </button>
                  ))}
                  {panels.length === 0 && <p className="empty">No panels.</p>}
                  {editable && (
                    <button
                      className="vtab"
                      onClick={() => run(() => addPanel(costing.id, company.id, `Panel ${panels.length + 1}`, panels.length))}
                    >
                      + Add a panel
                    </button>
                  )}
                  <div className="vlabel" style={{ marginTop: 14 }}>Whole costing</div>
                  {tabs.filter((t) => t.group === 'whole').map((t) => (
                    <button key={t.key} className={t.key === current ? 'vtab active' : 'vtab'} onClick={() => choose(t.key)}>
                      {t.label}
                    </button>
                  ))}
                </div>

                <div style={{ marginTop: 18 }}>
                  {/* A costing that charges nothing for labour says so here, where
                      the total is read. It blocks nothing (migration 0131). */}
                  {on('labour_check') && <LabourWarning costingId={costing.id} />}

                  <TotalsPanel
                    costing={costing}
                    totals={totals}
                    optionTotals={optionTotals}
                    bom={bom.data ?? []}
                    categoryNames={categoryNames}
                    editable={editable}
                    onChooseOption={(chosen) => run(() => updateCosting(costing.id, { chosen_option_label: chosen }))}
                  />
                </div>
              </div>

              <div>
                {panel !== undefined ? (
                  <>
                  <div className="section-head">
                    <span className="n">1</span>
                    <span className="sd ok" />
                    <h2>{panel.name}</h2>
                    <span className="q">what this panel is made of</span>
                  </div>
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
                      onPanelRemove: (pid) => { setTab(null); run(() => removePanel(pid)) },
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
                  {/* Roadmap 3.4, and house style §5 section 2: what the checks
                      made of this panel, said once, where it can be argued with
                      rather than buried among the lines it is about. */}
                  {on('compatibility_checks') && (
                    <>
                      <div className="section-head">
                        <span className="n">2</span>
                        <span className={(panelWarnings.get(panel.id) ?? []).length > 0 ? 'sd warn' : 'sd ok'} />
                        <h2>Checks on this panel</h2>
                        <span className="q">advisory — they change no figure</span>
                      </div>
                      <div className="panel">
                        <PanelWarnings warnings={panelWarnings.get(panel.id) ?? []} />
                      </div>
                    </>
                  )}
                  </>
                ) : (
                  <CostingWhole
                    tab={current}
                    data={data}
                    company={company}
                    editable={editable}
                    canBuild={canBuild}
                    isApprover={isApprover}
                    warnings={warnings.data ?? []}
                    components={components.data ?? []}
                    categoryNames={categoryNames}
                    processTypes={processTypes.data ?? []}
                    fits={fits.data ?? {}}
                    run={run}
                    refresh={refresh}
                  />
                )}
              </div>
            </div>
          </>
        )
      }}
    </Async>
  )
}
