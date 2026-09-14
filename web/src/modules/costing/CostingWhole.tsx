import { percent } from '../../lib/format'
import type {
  Company, ComponentPrice, PanelFit, PanelWarning, ProcessType,
} from '../../lib/database.types'
import type { CostingDetail } from './api'
import {
  addAssemblyToPanel, addComponentToPanel, addPanel, copyPanel, removeCostingAssembly, removeItem,
  removePanel, setCostingAssemblyQuantity, setItemQuantity, updateCosting, updatePanel,
} from './api'
import { CostingGrid } from './CostingGrid'
import { costingWarningSummary } from './warnings'
import { HistoryPanel } from './HistoryPanel'
import { QuotationLine } from '../quotation/QuotationLine'
import { BomExports } from './BomExports'
import { EplanCard } from './EplanCard'
import { buildTechnical } from '../quotation/pdf/prepare'
import { DocumentFiles } from '../documents/DocumentFiles'
import { BomImportCard } from './BomImportCard'
import { ApprovalPanel } from './ApprovalPanel'
import { ActualHoursCard } from './ActualHoursCard'
import { AssistantPanel } from '../assistant/AssistantPanel'
import { useFeatures } from '../admin/use-features'

/**
 * Everything on a costing that is not one panel (house style §5): the grid, the
 * commercial settings, the documents, the exports, the history.
 *
 * These were twelve cards in one column under the panels, which meant the
 * exports on a four-panel costing were five screens down. Each is behind a name
 * in the left column now; this decides which one is showing.
 */
export function CostingWhole({
  tab,
  data,
  company,
  editable,
  canBuild,
  isApprover,
  warnings,
  components,
  categoryNames,
  processTypes,
  fits,
  run,
  refresh,
}: {
  tab: string
  data: CostingDetail
  company: Company
  editable: boolean
  canBuild: boolean
  isApprover: boolean
  warnings: PanelWarning[]
  components: ComponentPrice[]
  categoryNames: Record<string, string>
  processTypes: ProcessType[]
  fits: Record<string, PanelFit | undefined>
  run: (fn: () => Promise<unknown>) => void
  refresh: () => Promise<void>
}) {
  const { on } = useFeatures()
  const { costing, panels, assemblies, items, panelPrices, totals } = data
  const label = costing.currency_label

  if (tab === 'grid') {
    return (
      <>
        <Head n="1" title="All panels side by side" hint="the same costing, edited the same way" />
        {on('compatibility_checks') && costingWarningSummary(warnings) !== '' && (
          <p className="muted">
            Compatibility checks: {costingWarningSummary(warnings)}. They are shown on the panels
            themselves, and change no figure.
          </p>
        )}
        <CostingGrid
          costing={costing}
          panels={panels}
          assemblies={assemblies}
          items={items}
          panelPrices={panelPrices}
          totals={totals}
          kits={data.kits}
          components={components}
          categoryNames={categoryNames}
          fits={fits}
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
            onPanelChange: (pid, changes) => run(() => updatePanel(pid, changes)),
            onRemovePanel: (pid) => run(() => removePanel(pid)),
          }}
        />
      </>
    )
  }

  if (tab === 'commercial') {
    return (
      <>
        <Head n="1" title="Margins & rounding" hint="frozen when this costing was created" />
        <div className="panel">
          {editable ? (
            <label className="field" style={{ margin: 0 }}>
              <span>Negotiation margin % <em className="hint">— optional buffer on top of everything, default 0</em></span>
              <input
                type="number" step="0.001" min="0" max="99.999"
                defaultValue={costing.negotiation_margin_pct}
                style={{ maxWidth: '8rem' }}
                onBlur={(e) => Number(e.target.value) !== costing.negotiation_margin_pct
                  && run(() => updateCosting(costing.id, { negotiation_margin_pct: Number(e.target.value) }))}
              />
            </label>
          ) : (
            <div className="total">
              <span>Negotiation margin</span>
              <span className="v">{percent(costing.negotiation_margin_pct)}</span>
            </div>
          )}
          <div className="total"><span>Material margin</span><span className="v">{percent(costing.material_margin_pct)}</span></div>
          <div className="total"><span>Labour margin</span><span className="v">{percent(costing.labour_margin_pct)}</span></div>
          <div className="total"><span>VAT</span><span className="v">{percent(costing.tax_pct)}</span></div>
          <div className="total"><span>Rounded up to</span><span className="v">{label} {costing.price_rounding_step}</span></div>
          <p className="muted" style={{ fontSize: '.8125rem' }}>
            Every figure but the negotiation margin was frozen from the company settings when this
            costing was created, so changing them later cannot move a price somebody has been quoted.
          </p>
        </div>
      </>
    )
  }

  if (tab === 'documents') {
    return (
      <>
        <Head n="1" title="Documents & imports" hint="the spec, the schedule, the drawing this answers" />
        {on('documents') && (
          <DocumentFiles entityType="costing" entityId={costing.id} companyId={costing.company_id} canEdit={editable} />
        )}
        {on('bom_import') && <BomImportCard costingId={costing.id} editable={editable} />}
      </>
    )
  }

  if (tab === 'actuals') {
    return (
      <>
        <Head n="1" title="Hours actually taken" hint="recorded after the work, changes no price" />
        <ActualHoursCard
          costingId={costing.id}
          panels={panels}
          processTypes={processTypes}
          currencyLabel={label}
          canRecord={canBuild}
        />
      </>
    )
  }

  if (tab === 'assistant') {
    return (
      <>
        <Head n="1" title="Assistant" hint="it proposes; a person applies" />
        <AssistantPanel
          entityType="costing"
          entityId={costing.id}
          panels={panels}
          canApply={editable}
          onApplied={() => void refresh()}
        />
      </>
    )
  }

  if (tab === 'exports') {
    return (
      <>
        <Head n="1" title="Exports" hint="four bills of materials, and the drawing office's files" />
        <BomExports
          costingId={costing.id}
          costingNo={costing.costing_no}
          revisionNo={costing.revision_no}
          currencyLabel={label}
        />
        {on('eplan_exports') && (
          <EplanCard
            costingId={costing.id}
            costingNo={costing.costing_no}
            revisionNo={costing.revision_no}
            title={costing.title}
            customerName={null}
            companyName={company.name}
            eplanProject={costing.eplan_project}
            drawingNumbers={costing.drawing_numbers}
            technical={buildTechnical(data)}
            editable={editable}
            onSaved={() => void refresh()}
          />
        )}
      </>
    )
  }

  return (
    <>
      <Head n="1" title="Approval" hint="what the company's rules make of this costing" />
      {on('approval_rules') && <ApprovalPanel costingId={costing.id} status={costing.status} />}
      {costing.status === 'approved' && (
        <QuotationLine costingId={costing.id} canRelease={isApprover && costing.is_current} />
      )}
      <Head n="2" title="History" hint="append-only; every change, and who made it" />
      <HistoryPanel costingId={costing.id} />
    </>
  )
}

function Head({ n, title, hint }: { n: string; title: string; hint: string }) {
  return (
    <div className="section-head">
      <span className="n">{n}</span>
      <span className="sd ok" />
      <h2>{title}</h2>
      <span className="q">{hint}</span>
    </div>
  )
}
