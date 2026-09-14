import type { Costing, CostingPanel, CostingStatus, PanelPrice } from '../../lib/database.types'

/**
 * The costing editor's left column (house style §5): one vertical tab per panel,
 * then the tabs that belong to the whole costing.
 *
 * It was one column of twelve cards read top to bottom, and a four-panel costing
 * meant scrolling past three panels to reach the exports. The panels are the work,
 * so they are the tabs; everything else is filed behind a name.
 *
 * Pure, so which tab exists under which switch is a thing a test can read.
 */

export interface CostingTab {
  key: string
  label: string
  /** The figure on the right of the tab — a panel's ex-VAT price, a count. */
  note?: string
  group: 'panels' | 'whole'
}

export interface TabInputs {
  panels: CostingPanel[]
  panelPrices: PanelPrice[]
  /** `on(code)` from the feature switches. */
  on: (code: string) => boolean
  /** How a price is written, so this stays free of the formatting helpers. */
  money: (amount: number) => string
}

export function costingTabs({ panels, panelPrices, on, money }: TabInputs): CostingTab[] {
  const tabs: CostingTab[] = panels.map((panel, i) => {
    const price = panelPrices.find((p) => p.panel_id === panel.id)
    return {
      key: panel.id,
      label: `${i + 1} · ${panel.name}`,
      ...(price === undefined ? {} : { note: money(price.line_total) }),
      group: 'panels' as const,
    }
  })

  if (on('costing_grid')) {
    tabs.push({ key: 'grid', label: 'All panels side by side', group: 'whole' })
  }
  tabs.push({ key: 'commercial', label: 'Margins & rounding', group: 'whole' })
  if (on('documents') || on('bom_import')) {
    tabs.push({ key: 'documents', label: 'Documents & imports', group: 'whole' })
  }
  if (on('labour_actuals')) {
    tabs.push({ key: 'actuals', label: 'Hours actually taken', group: 'whole' })
  }
  if (on('assistant')) {
    tabs.push({ key: 'assistant', label: 'Assistant', group: 'whole' })
  }
  tabs.push({ key: 'exports', label: 'Exports', group: 'whole' })
  tabs.push({ key: 'approval', label: 'Approval & history', group: 'whole' })
  return tabs
}

/** The tab to open on arrival: the grid if that is how this person reads a costing. */
export function firstTabKey(tabs: CostingTab[], preferGrid: boolean): string {
  if (preferGrid && tabs.some((t) => t.key === 'grid')) return 'grid'
  return tabs[0]?.key ?? 'approval'
}

export interface Step {
  label: string
  state: 'done' | 'now' | 'later'
}

/**
 * Draft → Submitted → Approved → Quotation released, with the one it is at now
 * in orange (house style §5).
 *
 * A returned costing is a draft again, which is the state the old screen said
 * least clearly and the one people most often misread.
 */
export function costingSteps(
  costing: Pick<Costing, 'status' | 'submitted_at' | 'approved_at'>,
  quotationReleased: boolean,
): Step[] {
  const order: CostingStatus[] = ['draft', 'submitted', 'approved']
  const at = order.indexOf(costing.status)
  const labels = ['Draft', 'Submitted', 'Approved']
  const steps: Step[] = labels.map((label, i) => ({
    label,
    state: i < at ? 'done' : i === at ? 'now' : 'later',
  }))
  steps.push({
    label: 'Quotation released',
    state: quotationReleased ? 'done' : 'later',
  })
  // Once the quotation is out, Approved is behind us rather than where we are.
  if (quotationReleased && steps[2] !== undefined) steps[2].state = 'done'
  return steps
}
