/**
 * Which way this person reads a costing: panel by panel, or the grid (roadmap
 * 2.9). A preference, so it lives in their own browser — not in `company_options`,
 * which is company data, and not worth a table of its own. Storage can throw or
 * come back empty (a private window, cleared site data), so every read and write
 * is guarded and "panel by panel" is the answer when anything is missing.
 */
export type CostingView = 'panels' | 'grid'

const KEY = 'costmatrix.costing-view'

export function readCostingView(): CostingView {
  try {
    return window.localStorage.getItem(KEY) === 'grid' ? 'grid' : 'panels'
  } catch {
    return 'panels'
  }
}

export function writeCostingView(view: CostingView): void {
  try {
    window.localStorage.setItem(KEY, view)
  } catch {
    // A preference nobody can save is still a preference for this visit.
  }
}
