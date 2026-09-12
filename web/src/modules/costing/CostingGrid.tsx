import { Fragment, useMemo, useState } from 'react'
import { money } from '../../lib/format'
import type {
  ComponentPrice, Costing, CostingAssembly, CostingItem, CostingPanel, CostingTotals, Kit, PanelFit,
  PanelPrice,
} from '../../lib/database.types'
import { buildGrid, cellAction, differingRows, type GridRow } from './grid'
import { downloadGridXlsx } from './grid-io'
import { KitPicker } from './KitPicker'
import { GridCell } from './GridCell'
import { GridToolbar } from './GridToolbar'

/**
 * The costing as one grid — panels across, kits and loose components down
 * (roadmap 2.9, `docs/reference/costing-grid-view.md`).
 *
 * It is a second way of editing the same records: every change goes through the
 * functions the panel editor uses, so prices freeze as they always did and the
 * history reads the same. Nothing is recomputed here — the model is built in
 * grid.ts and the money comes from the costing views.
 */
export interface GridHandlers {
  onAddKit: (panelId: string, kitId: string, quantity: number) => Promise<void>
  onAddComponent: (panelId: string, componentId: string, quantity: number) => Promise<void>
  onKitQuantity: (lineId: string, quantity: number) => void
  onItemQuantity: (itemId: string, quantity: number) => void
  onRemoveKit: (lineId: string) => void
  onRemoveItem: (itemId: string) => void
  onAddPanel: () => void
  onCopyPanel: (sourcePanelId: string) => void
}

export function CostingGrid({
  costing, panels, assemblies, items, panelPrices, totals, kits, components, categoryNames,
  fits, editable, handlers,
}: {
  costing: Costing
  panels: CostingPanel[]
  assemblies: CostingAssembly[]
  items: CostingItem[]
  panelPrices: PanelPrice[]
  totals: CostingTotals | null
  kits: Kit[]
  components: ComponentPrice[]
  categoryNames: Record<string, string>
  /** The F12 space check per panel, where it has something to say. */
  fits: Record<string, PanelFit | undefined>
  editable: boolean
  handlers: GridHandlers
}) {
  const [compareA, setCompareA] = useState('')
  const [compareB, setCompareB] = useState('')
  const [picking, setPicking] = useState<string | null>(null)
  const [openKit, setOpenKit] = useState<string | null>(null)
  const [refused, setRefused] = useState<string | null>(null)

  const model = useMemo(
    () => buildGrid({
      panels, assemblies, items, panelPrices, totals, kits, components, categoryNames,
      roundingStep: costing.price_rounding_step,
    }),
    [panels, assemblies, items, panelPrices, totals, kits, components, categoryNames, costing.price_rounding_step],
  )

  const comparing = compareA !== '' && compareB !== '' && compareA !== compareB
  const differing = useMemo(
    () => (comparing ? differingRows(model, compareA, compareB) : new Set<string>()),
    [comparing, model, compareA, compareB],
  )
  const inCompare = (panelId: string) => comparing && (panelId === compareA || panelId === compareB)
  const label = costing.currency_label

  const edit = (row: GridRow, panelId: string, typed: number | null) => {
    const action = cellAction(row, panelId, typed)
    setRefused(null)
    switch (action.kind) {
      case 'add':
        void (row.kind === 'kit'
          ? handlers.onAddKit(panelId, action.sourceId, typed ?? 1)
          : handlers.onAddComponent(panelId, action.sourceId, typed ?? 1))
        return
      case 'quantity':
        return row.kind === 'kit'
          ? handlers.onKitQuantity(action.lineId, action.quantity)
          : handlers.onItemQuantity(action.lineId, action.quantity)
      case 'remove':
        return row.kind === 'kit'
          ? handlers.onRemoveKit(action.lineId)
          : handlers.onRemoveItem(action.lineId)
      default:
        setRefused(action.reason)
    }
  }

  const kitLinesOf = (row: GridRow): CostingItem[] => {
    const lineId = Object.values(row.cells).flatMap((c) => c.lineIds)[0]
    return lineId ? items.filter((i) => i.costing_assembly_id === lineId) : []
  }

  return (
    <div className="card">
      <GridToolbar
        panels={panels}
        editable={editable}
        comparing={comparing}
        differingCount={differing.size}
        compareA={compareA}
        compareB={compareB}
        onCompareA={setCompareA}
        onCompareB={setCompareB}
        onExcel={() => void downloadGridXlsx(model, costing.costing_no, costing.revision_no, label)}
        onAddPanel={handlers.onAddPanel}
        onCopyPanel={handlers.onCopyPanel}
      />

      {refused && <p className="error" style={{ marginTop: '.5rem' }}>{refused}</p>}

      <div className="table-wrap" style={{ marginTop: '.75rem' }}>
        <table>
          <thead>
            <tr>
              <th style={{ minWidth: '18rem' }}>Kit / component</th>
              <th>Group</th>
              {model.columns.map((c) => (
                <th
                  key={c.panel.id}
                  className="right"
                  style={inCompare(c.panel.id) ? { background: 'rgba(245, 158, 11, .12)' } : undefined}
                >
                  {c.panel.name}
                  <div className="muted" style={{ fontSize: '.75rem', fontWeight: 400 }}>
                    {[c.panel.tag, `qty ${Number(c.panel.quantity)}`, c.isOption ? 'option' : null]
                      .filter(Boolean).join(' · ')}
                  </div>
                  {spaceWarning(fits[c.panel.id]) && (
                    <div className="error" style={{ fontSize: '.75rem', fontWeight: 400 }} title={spaceWarning(fits[c.panel.id]) ?? ''}>
                      {spaceWarning(fits[c.panel.id])}
                    </div>
                  )}
                </th>
              ))}
              <th className="right">
                All panels
                <div className="muted" style={{ fontSize: '.75rem', fontWeight: 400 }}>× panel qty</div>
              </th>
            </tr>
          </thead>
          <tbody>
            {model.sections.map((section) => (
              <Fragment key={section.heading}>
                <tr style={{ background: 'var(--tint, #f3f4f6)' }}>
                  <td colSpan={model.columns.length + 3} style={{ fontSize: '.75rem', letterSpacing: '.04em', textTransform: 'uppercase', fontWeight: 700 }}>
                    {section.heading}
                  </td>
                </tr>
                {section.rows.map((row) => (
                  <Fragment key={row.key}>
                    <tr className={differing.has(row.key) ? 'row-differs' : undefined}>
                      <td>
                        {row.kind === 'kit' ? (
                          <button
                            className="link"
                            style={{ textAlign: 'left', padding: 0, background: 'none', border: 0, cursor: 'pointer', font: 'inherit' }}
                            onClick={() => setOpenKit(openKit === row.key ? null : row.key)}
                          >
                            {row.name}
                          </button>
                        ) : (
                          <>
                            {row.name}{' '}
                            <span className="badge" style={{ fontSize: '.7rem' }}>{row.kind}</span>
                          </>
                        )}
                        {row.unpriced && (
                          <div className="error" style={{ fontSize: '.75rem' }} title="A part in this row has no price in the library now, so it could not be costed again.">
                            unpriced part
                          </div>
                        )}
                      </td>
                      <td className="muted">{row.group}</td>
                      {model.columns.map((c) => (
                        <GridCell
                          key={c.panel.id}
                          cell={row.cells[c.panel.id]}
                          editable={editable}
                          highlight={differing.has(row.key) && inCompare(c.panel.id)}
                          inCompare={inCompare(c.panel.id)}
                          onCommit={(typed) => edit(row, c.panel.id, typed)}
                        />
                      ))}
                      <td className="right">{row.total === 0 ? '' : round3(row.total)}</td>
                    </tr>
                    {openKit === row.key && (
                      <tr>
                        <td colSpan={model.columns.length + 3} className="muted" style={{ fontSize: '.8125rem' }}>
                          {kitLinesOf(row).length === 0
                            ? 'This kit has no lines on this costing.'
                            : kitLinesOf(row).map((i) => `${round3(Number(i.quantity))} × ${i.name}`).join(' · ')}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </Fragment>
            ))}

            {editable && (
              <tr>
                <td colSpan={2} className="muted" style={{ fontSize: '.8125rem' }}>Add a kit to a panel</td>
                {model.columns.map((c) => (
                  <td key={c.panel.id} className="right">
                    <button
                      title={`Add a kit to ${c.panel.name}`}
                      onClick={() => setPicking(picking === c.panel.id ? null : c.panel.id)}
                    >
                      +
                    </button>
                  </td>
                ))}
                <td />
              </tr>
            )}

            {model.totals.map((total) => (
              <tr key={total.label} style={{ background: 'var(--tint, #f9fafb)' }}>
                <td colSpan={2} style={{ fontWeight: total.strong ? 700 : 600 }}>
                  {total.label}
                  {total.note && <span className="muted" style={{ fontWeight: 400 }}> ({total.note})</span>}
                </td>
                {total.values.map((v, i) => (
                  <td key={model.columns[i]?.panel.id ?? i} className="right" style={{ fontWeight: total.strong ? 700 : undefined }}>
                    {v === null ? '' : money(v, label)}
                  </td>
                ))}
                <td className="right" style={{ fontWeight: total.strong ? 700 : undefined }}>
                  {total.total === null ? '' : money(total.total, label)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {picking && (
        <div style={{ marginTop: '.5rem' }}>
          <p className="muted" style={{ fontSize: '.8125rem', margin: 0 }}>
            Adding a kit to <strong>{panels.find((p) => p.id === picking)?.name}</strong>. It becomes a
            row for every panel, blank where they do not use it.
          </p>
          <KitPicker
            kits={kits}
            onAdd={async (kitId, qty) => {
              await handlers.onAddKit(picking, kitId, qty)
              setPicking(null)
            }}
          />
        </div>
      )}
    </div>
  )
}

/** Only when the space check has something an engineer can act on (F12). */
function spaceWarning(fit: PanelFit | undefined): string | null {
  if (!fit || fit.used_pct === null) return null
  if (fit.verdict === 'no_fit') return `space ${Math.round(fit.used_pct)} % · will not fit`
  if (fit.verdict === 'tight') return `space ${Math.round(fit.used_pct)} % · check`
  return null
}

function round3(n: number): string {
  return String(Math.round(n * 1000) / 1000)
}
